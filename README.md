# Oxyon Verify MCP

A **verify-only** [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an AI agent check GeoProof evidence (XYO bound witnesses and GeoProof receipts) and explains what each result does and does not establish.

**It cannot sign anything.** It holds no key, reads no files or environment variables, and makes no network requests. Every check runs offline on the JSON you pass in. The tests enforce this against the source (`tests/boundary.test.mjs`).

Oxyon is independent; it is not XYO Network or XY Labs.

## Tools

| Tool | What it does |
|---|---|
| `oxyon_capabilities` | What the server can and cannot do, its limits and its result states. Call it first. |
| `oxyon_docs` | Short documentation by topic: `overview`, `results`, `boundaries`, `verify`, `replay`, `provenance`, `oxyon-evidence`. |
| `oxyon_verify` | Validates one bound witness offline: signatures, payload hashes, structure. |
| `oxyon_replay` | Stranger-mode re-check of a receipt against its proof: both signatures, the hash link, the signed receipt payload, and optional anchor-batch membership. |
| `oxyon_provenance` | Signers, previous hashes and declared payloads; matches the payloads you supply by recomputed hash. |

**Not provided, by design:** attestation signing, issuing receipts, anchoring, revocation, superseding records, key rotation, wallet access, transaction signing, administrative operations, network access.

## Results

`VERIFIED` (every check in scope passed), `FAILED` (at least one disagreed), `INCONCLUSIVE`, `NOT_EVALUATED`, `UNSUPPORTED` (not a format this tool reads).

A VERIFIED result means the JSON is intact and signed by the listed addresses. It does **not** establish that a signed statement is true, who controls a signing address, or that anything was anchored on a live network (on-chain anchoring is always `NOT_EVALUATED` here).

## Limits

256 KB per call, 32 levels of nesting, 64 payloads, 10 seconds per check. Oversized or malformed input is refused with a short message and no internals.

## Install

Requires Node 22 or later.

```bash
git clone https://github.com/OxyonLLC/oxyon-verify-mcp.git
cd oxyon-verify-mcp
npm ci
npm test
```

**Claude Code**

```bash
claude mcp add oxyon-verify -- node /path/to/oxyon-verify-mcp/src/stdio.mjs
```

**Claude Desktop, Cursor and others** (`mcpServers` config):

```json
{ "mcpServers": { "oxyon-verify": { "command": "node", "args": ["/path/to/oxyon-verify-mcp/src/stdio.mjs"] } } }
```

## Related

- [Proof Center](https://oxyon.io/proof/center/): check Oxyon's published evidence records in your browser.
- [Independent verifier](https://github.com/LewSales/oxyon-evidence/blob/main/VERIFY.md) for Oxyon evidence records anchored on XL1.
- [oxyon.io/llms.txt](https://oxyon.io/llms.txt) and [oxyon.io/openapi.json](https://oxyon.io/openapi.json).

Security reports: see [oxyon.io/.well-known/security.txt](https://oxyon.io/.well-known/security.txt).
