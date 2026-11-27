// Oxyon Verify MCP: a verify-only Model Context Protocol server (Sprint 002F, owner-approved 2026-11-27).
//
// It can CHECK GeoProof evidence and NOTHING else. By construction:
//   - it imports no signer, wallet, account, seed or builder code, and reads no environment variables or files;
//   - it holds no key, so it cannot attest, issue receipts, anchor, revoke, supersede or rotate anything;
//   - it makes no network requests: every check runs on the JSON you pass in.
// tests/boundary.test.mjs enforces all three against this source.
//
// Results use Oxyon's vocabulary: VERIFIED, FAILED, UNSUPPORTED for a result, NOT_EVALUATED for a check that is out of
// scope offline (on-chain anchoring). INCONCLUSIVE is never produced here: an offline tool has no source that can be
// unavailable. A result is about the
// signatures and hash links of the exact JSON given; it never establishes that a signed statement is true.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { BoundWitnessValidator } from '@xyo-network/boundwitness-validator'
import { PayloadBuilder } from '@xyo-network/payload-builder'

export const VERSION = '1.1.0'
export const RESULTS = Object.freeze(['VERIFIED', 'FAILED', 'UNSUPPORTED'])
export const LIMITS = Object.freeze({ maxInputBytes: 256 * 1024, maxDepth: 32, maxPayloads: 64, timeoutMs: 10_000 })
export const TOOLS = Object.freeze(['oxyon_capabilities', 'oxyon_docs', 'oxyon_verify', 'oxyon_replay', 'oxyon_provenance'])
export const NOT_PROVIDED = Object.freeze(['attestation signing', 'issuing receipts', 'anchoring', 'revocation', 'superseding records',
  'key rotation', 'wallet access', 'transaction signing', 'administrative operations', 'network access'])
const BW_SCHEMA = 'network.xyo.boundwitness'

// ── guards: size, depth, time ───────────────────────────────────────────────
export class InputRejected extends Error {}
function depthOf(value) {
  let max = 0
  const stack = [[value, 1]]
  while (stack.length) {
    const [v, d] = stack.pop()
    if (d > max) max = d
    if (max > LIMITS.maxDepth) return max
    if (v && typeof v === 'object') for (const k of Object.keys(v)) stack.push([v[k], d + 1])
  }
  return max
}
export function checkInput(args) {
  let text
  try { text = JSON.stringify(args) } catch { throw new InputRejected('input is not plain JSON') }
  const bytes = Buffer.byteLength(text ?? '', 'utf8')
  if (bytes > LIMITS.maxInputBytes) throw new InputRejected(`input is ${bytes} bytes; the limit is ${LIMITS.maxInputBytes}`)
  if (depthOf(args) > LIMITS.maxDepth) throw new InputRejected(`input nests deeper than ${LIMITS.maxDepth} levels`)
}
function withTimeout(promise) {
  let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new InputRejected(`check took longer than ${LIMITS.timeoutMs} ms`)), LIMITS.timeoutMs) })])
    .finally(() => clearTimeout(timer))
}
const asText = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data })
const asError = (e) => ({ content: [{ type: 'text', text: `error: ${e instanceof InputRejected ? e.message : 'the input could not be checked'}` }], isError: true })
/** Every tool runs through this: input guards, a time limit, and errors that never echo internals. */
const guarded = (fn) => async (args) => {
  try { checkInput(args); return asText(await withTimeout(fn(args))) } catch (e) { return asError(e) }
}

// ── checks (pure; no key, no network) ───────────────────────────────────────
const hashOf = (obj) => PayloadBuilder.hash(obj)
const isBoundWitness = (bw) => bw && typeof bw === 'object' && bw.schema === BW_SCHEMA
async function problemsOf(bw) { return (await new BoundWitnessValidator(bw).validate()).map((e) => String(e?.message ?? e)) }
const SCOPE = 'Checks the signatures, hashes and structure of the JSON given, offline. It does not establish that any signed statement is true, who controls a signing address, or that anything was anchored on a live network.'

export async function verify(boundWitness) {
  if (!isBoundWitness(boundWitness)) return { result: 'UNSUPPORTED', reason: `not a bound witness (schema must be "${BW_SCHEMA}")`, scope: SCOPE }
  const problems = await problemsOf(boundWitness)
  return { result: problems.length ? 'FAILED' : 'VERIFIED', problems, hash: await hashOf(boundWitness), signers: boundWitness.addresses ?? [], scope: SCOPE }
}

export async function replay({ proofBoundWitness, receipt, receiptBoundWitness, anchorBatch }) {
  if (![proofBoundWitness, receiptBoundWitness].every(isBoundWitness)) return { result: 'UNSUPPORTED', reason: 'proofBoundWitness and receiptBoundWitness must both be bound witnesses', scope: SCOPE }
  const checks = {}
  const problems = []
  checks.proofSignaturesValid = (await problemsOf(proofBoundWitness)).length === 0
  if (!checks.proofSignaturesValid) problems.push('the proof bound witness failed validation')
  checks.receiptSignaturesValid = (await problemsOf(receiptBoundWitness)).length === 0
  if (!checks.receiptSignaturesValid) problems.push('the receipt bound witness failed validation')
  const proofHash = await hashOf(proofBoundWitness)
  checks.receiptLinksToProof = receipt?.proofHash === proofHash
  if (!checks.receiptLinksToProof) problems.push('the receipt does not name this exact proof (hash mismatch: tampered, or the wrong proof)')
  checks.receiptIsSignedPayload = (receiptBoundWitness.payload_hashes ?? []).includes(await hashOf(receipt ?? {}))
  if (!checks.receiptIsSignedPayload) problems.push('the receipt payload is not one the receipt bound witness signed')
  let anchor = 'NOT_EVALUATED'
  if (anchorBatch) {
    const listed = anchorBatch.proofHashes ?? []
    checks.batchListsProofAndReceipt = listed.includes(proofHash) && listed.includes(await hashOf(receiptBoundWitness))
    if (!checks.batchListsProofAndReceipt) problems.push('the anchor batch does not list both the proof and the receipt')
    anchor = 'NOT_EVALUATED: batch membership was checked; whether the batch is on a live network was not'
  }
  return { result: problems.length ? 'FAILED' : 'VERIFIED', receiptVerdict: receipt?.verdict ?? null, checks, problems, anchor, scope: SCOPE }
}

export async function provenance({ boundWitness, payloads = [] }) {
  if (!isBoundWitness(boundWitness)) return { result: 'UNSUPPORTED', reason: `not a bound witness (schema must be "${BW_SCHEMA}")` }
  if (payloads.length > LIMITS.maxPayloads) throw new InputRejected(`at most ${LIMITS.maxPayloads} payloads`)
  const declared = boundWitness.payload_hashes ?? []
  const given = await Promise.all(payloads.map(async (p) => ({ hash: await hashOf(p), schema: p?.schema ?? null })))
  return {
    hash: await hashOf(boundWitness),
    signers: boundWitness.addresses ?? [],
    previousHashes: boundWitness.previous_hashes ?? [],
    payloads: declared.map((h, i) => ({ hash: h, schema: boundWitness.payload_schemas?.[i] ?? null, supplied: given.some((g) => g.hash === h) })),
    unlisted: given.filter((g) => !declared.includes(g.hash)),
    signaturesChecked: false,
    note: 'Provenance is read from the bound witness as given; run oxyon_verify to check its signatures. Supplied payloads are matched by recomputed hash.',
  }
}

const DOCS = {
  overview: 'Oxyon Verify checks GeoProof evidence (XYO bound witnesses and GeoProof receipts) offline. It holds no key and cannot sign, anchor, revoke or change anything. Oxyon is independent; it is not XYO Network or XY Labs. https://oxyon.io/proof/center/',
  results: 'This server returns VERIFIED (every check in scope passed), FAILED (at least one check disagreed) or UNSUPPORTED (not a format it reads). NOT_EVALUATED marks a check it cannot do offline, such as whether a batch is on a live chain. It never returns INCONCLUSIVE: working offline, it has no source that can be unavailable. The Oxyon Proof Center, which reads the chain, can return INCONCLUSIVE and PENDING (waiting for finality, not a verdict).',
  boundaries: `Provided: ${TOOLS.join(', ')}. Not provided: ${NOT_PROVIDED.join(', ')}. Limits: ${LIMITS.maxInputBytes} bytes per call, ${LIMITS.maxDepth} levels of nesting, ${LIMITS.timeoutMs} ms per check.`,
  verify: 'oxyon_verify(boundWitness): validates signatures, payload hashes and structure of one bound witness. VERIFIED says the JSON is intact and signed by the listed addresses; it does not say the statement is true.',
  replay: 'oxyon_replay(proofBoundWitness, receipt, receiptBoundWitness, anchorBatch?): stranger-mode re-check of a receipt: both signatures, that the receipt names this exact proof, that the receipt payload is the one signed, and optional batch membership. On-chain anchoring is NOT_EVALUATED here.',
  provenance: 'oxyon_provenance(boundWitness, payloads?): lists signers, previous hashes and declared payloads, and matches supplied payloads by recomputed hash. It does not check signatures; use oxyon_verify.',
  'oxyon-evidence': 'Oxyon\'s published evidence records (anchored on XL1) are checked in the browser at https://oxyon.io/proof/center/ or independently with the Python verifier: https://github.com/LewSales/oxyon-evidence/blob/main/VERIFY.md',
}
export const DOC_TOPICS = Object.freeze(Object.keys(DOCS))

/** A verify-only server. Nothing in it can sign. */
export function createVerifyServer() {
  const server = new McpServer({ name: 'oxyon-verify', version: VERSION })
  const json = z.record(z.string(), z.unknown())

  server.registerTool('oxyon_capabilities', {
    description: 'What this verify-only server can and cannot do, its limits and its result states. Call this first.',
    inputSchema: {},
  }, guarded(async () => ({ server: 'oxyon-verify', version: VERSION, tools: TOOLS, notProvided: NOT_PROVIDED, limits: LIMITS,
    results: RESULTS, checkStates: ['NOT_EVALUATED'], network: 'none', keys: 'none', docs: DOC_TOPICS,
    establishes: 'Signatures, hashes and links within the JSON you supply.',
    doesNotEstablish: 'Current blockchain state, that anything is on a live chain, that a statement is true, or who controls a signing address.' })))

  server.registerTool('oxyon_docs', {
    description: 'Short documentation for one topic: ' + DOC_TOPICS.join(', ') + '.',
    inputSchema: { topic: z.enum(DOC_TOPICS) },
  }, guarded(async ({ topic }) => ({ topic, text: DOCS[topic] })))

  server.registerTool('oxyon_verify', {
    description: 'Validate one bound witness offline: signatures, payload hashes, structure. VERIFIED or FAILED with the exact problems; UNSUPPORTED if it is not a bound witness. Never establishes that a statement is true.',
    inputSchema: { boundWitness: json.describe('The bound witness JSON') },
  }, guarded(async ({ boundWitness }) => verify(boundWitness)))

  server.registerTool('oxyon_replay', {
    description: 'Stranger-mode re-check of a GeoProof receipt against its proof: both signatures, the hash link, the signed receipt payload, and optional anchor-batch membership. Trusts nothing; signs nothing.',
    inputSchema: {
      proofBoundWitness: json.describe('The original proof bound witness'),
      receipt: json.describe('The receipt payload'),
      receiptBoundWitness: json.describe('The bound witness that signed the receipt'),
      anchorBatch: json.optional().describe('Optional anchor batch payload'),
    },
  }, guarded(async (args) => replay(args)))

  server.registerTool('oxyon_provenance', {
    description: 'Inspect a bound witness: signers, previous hashes, declared payloads, and which supplied payloads match by recomputed hash. Does not check signatures (use oxyon_verify).',
    inputSchema: { boundWitness: json, payloads: z.array(json).max(LIMITS.maxPayloads).optional() },
  }, guarded(async (args) => provenance(args)))

  return server
}
