// Correct results, input validation, resource limits and failure handling. Test fixtures are signed here, in the
// test only, with throwaway accounts (devDependencies); the server itself never signs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { Account } from '@xyo-network/account'
import { BoundWitnessBuilder } from '@xyo-network/boundwitness-builder'
import { PayloadBuilder } from '@xyo-network/payload-builder'
import { LIMITS } from '../src/server.mjs'
import { connect } from './connect.mjs'

const call = async (client, name, args) => {
  const r = await client.callTool({ name, arguments: args })
  return r.isError ? { error: r.content[0].text } : JSON.parse(r.content[0].text)
}
async function fixture() {
  const attester = await Account.random(), verifier = await Account.random()
  const statement = { schema: 'network.xyo.test.statement', text: 'hello' }
  const [proof] = await new BoundWitnessBuilder().payload(statement).signer(attester).build()
  const receipt = { schema: 'network.xyo.test.receipt', proofHash: await PayloadBuilder.hash(proof), verdict: 'verified' }
  const [receiptBw] = await new BoundWitnessBuilder().payload(receipt).signer(verifier).build()
  const batch = { schema: 'network.xyo.test.batch', proofHashes: [await PayloadBuilder.hash(proof), await PayloadBuilder.hash(receiptBw)] }
  return { proof, statement, receipt, receiptBw, batch, attester }
}
const clone = (x) => JSON.parse(JSON.stringify(x))

test('verify: an intact bound witness is VERIFIED; a tampered one is FAILED; anything else UNSUPPORTED', async () => {
  const { client, close } = await connect()
  const { proof, attester } = await fixture()
  try {
    const ok = await call(client, 'oxyon_verify', { boundWitness: proof })
    assert.equal(ok.result, 'VERIFIED'); assert.deepEqual(ok.problems, []); assert.deepEqual(ok.signers, [attester.address])
    assert.match(ok.scope, /does not establish/)
    const bad = clone(proof); bad.payload_hashes = ['00'.repeat(32)]
    assert.equal((await call(client, 'oxyon_verify', { boundWitness: bad })).result, 'FAILED')
    assert.equal((await call(client, 'oxyon_verify', { boundWitness: { schema: 'something.else' } })).result, 'UNSUPPORTED')
  } finally { await close() }
})

test('replay: a genuine receipt is VERIFIED; a receipt for another proof, or an edited receipt, is FAILED', async () => {
  const { client, close } = await connect()
  const f = await fixture(), other = await fixture()
  try {
    const ok = await call(client, 'oxyon_replay', { proofBoundWitness: f.proof, receipt: f.receipt, receiptBoundWitness: f.receiptBw, anchorBatch: f.batch })
    assert.equal(ok.result, 'VERIFIED'); assert.equal(ok.receiptVerdict, 'verified'); assert.match(ok.anchor, /^NOT_EVALUATED/)
    const swapped = await call(client, 'oxyon_replay', { proofBoundWitness: other.proof, receipt: f.receipt, receiptBoundWitness: f.receiptBw })
    assert.equal(swapped.result, 'FAILED'); assert.equal(swapped.checks.receiptLinksToProof, false)
    const edited = await call(client, 'oxyon_replay', { proofBoundWitness: f.proof, receipt: { ...f.receipt, verdict: 'rejected' }, receiptBoundWitness: f.receiptBw })
    assert.equal(edited.result, 'FAILED'); assert.equal(edited.checks.receiptIsSignedPayload, false)
  } finally { await close() }
})

test('provenance: lists signers and matches supplied payloads by hash, without claiming a signature check', async () => {
  const { client, close } = await connect()
  const f = await fixture()
  try {
    const p = await call(client, 'oxyon_provenance', { boundWitness: f.proof, payloads: [f.statement, { schema: 'x.unrelated' }] })
    assert.deepEqual(p.signers, [f.attester.address]); assert.equal(p.payloads[0].supplied, true)
    assert.equal(p.unlisted.length, 1); assert.equal(p.signaturesChecked, false)
  } finally { await close() }
})

test('capabilities and docs describe the boundary', async () => {
  const { client, close } = await connect()
  try {
    const c = await call(client, 'oxyon_capabilities', {})
    assert.equal(c.keys, 'none'); assert.equal(c.network, 'none'); assert.ok(c.notProvided.includes('attestation signing'))
    assert.match((await call(client, 'oxyon_docs', { topic: 'boundaries' })).text, /Not provided/)
    const bad = await client.callTool({ name: 'oxyon_docs', arguments: { topic: '../../etc/passwd' } }).catch(() => ({ isError: true }))
    assert.equal(bad.isError, true)
  } finally { await close() }
})

test('limits: oversized and deeply nested input is refused, malformed input fails safely', async () => {
  const { client, close } = await connect()
  try {
    const big = await call(client, 'oxyon_verify', { boundWitness: { schema: 'network.xyo.boundwitness', pad: 'x'.repeat(LIMITS.maxInputBytes + 1) } })
    assert.match(big.error, /limit is/)
    let deep = {}; const root = deep; for (let i = 0; i < LIMITS.maxDepth + 5; i++) { deep.a = {}; deep = deep.a }
    assert.match((await call(client, 'oxyon_verify', { boundWitness: { schema: 'network.xyo.boundwitness', root } })).error, /nests deeper/)
    const junk = await call(client, 'oxyon_verify', { boundWitness: { schema: 'network.xyo.boundwitness', addresses: 'not-an-array', $signatures: 7 } })
    assert.ok(junk.error || junk.result === 'FAILED', JSON.stringify(junk))
    assert.doesNotMatch(JSON.stringify(junk), /at \w+ \(|node_modules/, 'no stack traces leak')
    const wrongType = await client.callTool({ name: 'oxyon_verify', arguments: { boundWitness: 'a string' } }).catch(() => ({ isError: true }))
    assert.equal(wrongType.isError, true)
  } finally { await close() }
})
