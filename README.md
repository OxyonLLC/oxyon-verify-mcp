# Oxyon Verify MCP

A **verify-only** [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an AI agent check GeoProof evidence (XYO bound witnesses and GeoProof receipts) and explains what each result does and does not establish.

**It cannot sign anything.** It holds no key, reads no files or environment variables, and makes no network requests. Every check runs offline on the JSON you pass in. The tests enforce this against the source (`tests/boundary.test.mjs`).

Oxyon is independent; it is not XYO Network or XY Labs.

## What it can and cannot tell you

| Kind of check | Does this server do it? |
|---|---|
| **Cryptographic verification**: signatures, payload hashes and structure of a bound witness | Yes: `oxyon_verify` |
| **Receipt validation**: the receipt is signed, names this exact proof, and is the payload that was signed | Yes: `oxyon_replay` |
| **Deterministic replay**: the same input always gives the same result, anywhere | Yes: everything runs offline, see `examples/` |
| **Verification against supplied evidence**: an anchor batch lists the proof and the receipt | Yes, as batch membership only |
| **Independent live-chain verification**: the batch is really on a blockchain, current chain state | **No.** It has no network access. Reported as `NOT_EVALUATED`. Use the [Proof Center](https://oxyon.io/proof/center/) or the [independent verifier](https://github.com/LewSales/oxyon-evidence/blob/main/VERIFY.md), which read the chain. |

A `VERIFIED` result means the JSON is intact and signed by the addresses listed. It does **not** establish that a signed statement is true, or who controls a signing address.

## Install (about 2 minutes)

You need [Node.js 22](https://nodejs.org) or later.

```bash
git clone https://github.com/OxyonLLC/oxyon-verify-mcp.git
cd oxyon-verify-mcp
npm ci
npm test
```

`npm test` should end with `fail 0`. You now have a working server at `src/stdio.mjs`.

## Connect it to your AI client

It speaks MCP over **stdio**, so any client that can launch a local MCP server works. Replace `/path/to` with where you cloned it.

**Claude Code**

```bash
claude mcp add oxyon-verify -- node /path/to/oxyon-verify-mcp/src/stdio.mjs
```

**Claude Desktop, Cursor and other clients** (their `mcpServers` setting):

```json
{ "mcpServers": { "oxyon-verify": { "command": "node", "args": ["/path/to/oxyon-verify-mcp/src/stdio.mjs"] } } }
```

Tested with the official MCP TypeScript SDK client (1.32.2) over stdio: tool discovery, input schemas, structured results and errors. The client configurations above follow each client's documented format.

## Try it with the sample evidence

`examples/samples/` holds **safe, synthetic** evidence: signed with throwaway keys made only for these samples, about a made-up temperature reading. `examples/results/` holds the exact output each one produces; `tests/examples.test.mjs` replays them all and fails if anything differs.

Ask your agent, for example: *"Use oxyon_verify on examples/samples/proof.json"* (paste the file's contents).

**A successful result** (`oxyon_replay` with the proof, receipt, receipt bound witness and batch; abridged):

```json
{ "result": "VERIFIED", "receiptVerdict": "verified",
  "checks": { "proofSignaturesValid": true, "receiptSignaturesValid": true, "receiptLinksToProof": true, "receiptIsSignedPayload": true, "batchListsProofAndReceipt": true },
  "anchor": "NOT_EVALUATED: batch membership was checked; whether the batch is on a live network was not" }
```

**A failed result** (the receipt's verdict edited after signing):

```json
{ "result": "FAILED", "checks": { "receiptIsSignedPayload": false },
  "problems": ["the receipt payload is not one the receipt bound witness signed"] }
```

**Unsupported input** (a plain payload, not a bound witness):

```json
{ "result": "UNSUPPORTED", "reason": "not a bound witness (schema must be \"network.xyo.boundwitness\")" }
```

**Inconclusive results:** this server never returns `INCONCLUSIVE`. Working offline, it has no source that can be unavailable: a check either runs on what you gave it or is marked `NOT_EVALUATED`. Oxyon's [Proof Center](https://oxyon.io/proof/center/), which reads the chain, does return `INCONCLUSIVE` (a source was unavailable) and `PENDING` (waiting for finality, not a verdict).

## Tools

| Tool | What it does |
|---|---|
| `oxyon_capabilities` | What the server can and cannot do, its limits and its result states. Call it first. |
| `oxyon_docs` | Short documentation by topic: `overview`, `results`, `boundaries`, `verify`, `replay`, `provenance`, `oxyon-evidence`. |
| `oxyon_verify` | Validates one bound witness offline. |
| `oxyon_replay` | Stranger-mode re-check of a receipt against its proof, with optional batch membership. |
| `oxyon_provenance` | Signers, previous hashes and declared payloads; matches the payloads you supply by recomputed hash. It does not check signatures. |

## Limits and errors

- 256 KB per call, 32 levels of nesting, 64 payloads, 10 seconds per check.
- Oversized, malformed or wrongly typed input is refused with a short message. Errors never include stack traces or internals.

## Security boundaries

**Not provided, by design:** attestation signing, issuing receipts, anchoring, revocation, superseding records, key rotation, wallet access, transaction signing, administrative operations, network access. Oxyon's signing tools are not part of this project.

Security reports: see [oxyon.io/.well-known/security.txt](https://oxyon.io/.well-known/security.txt).

## Related

- [Proof Center](https://oxyon.io/proof/center/): check Oxyon's published evidence records, anchored on XL1, in your browser.
- [oxyon.io/llms.txt](https://oxyon.io/llms.txt) and [oxyon.io/openapi.json](https://oxyon.io/openapi.json).
