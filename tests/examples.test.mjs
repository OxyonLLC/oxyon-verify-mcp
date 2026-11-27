// Reproducibility: every documented example, replayed through a real MCP client, gives exactly the committed result.
// Results are deterministic because everything runs offline on the committed sample files.
// To refresh examples/results after an intended change: UPDATE_EXAMPLES=1 npm test
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { connect } from './connect.mjs'

const sample = (n) => JSON.parse(readFileSync(new URL(`../examples/samples/${n}.json`, import.meta.url), 'utf8'))
const resultsDir = new URL('../examples/results/', import.meta.url)
export const SCENARIOS = {
  'verify-ok': ['oxyon_verify', () => ({ boundWitness: sample('proof') }), 'VERIFIED'],
  'verify-tampered': ['oxyon_verify', () => ({ boundWitness: sample('proof-tampered') }), 'FAILED'],
  'verify-unsupported': ['oxyon_verify', () => ({ boundWitness: sample('statement') }), 'UNSUPPORTED'],
  'replay-ok': ['oxyon_replay', () => ({ proofBoundWitness: sample('proof'), receipt: sample('receipt'), receiptBoundWitness: sample('receipt-bw'), anchorBatch: sample('batch') }), 'VERIFIED'],
  'replay-edited-receipt': ['oxyon_replay', () => ({ proofBoundWitness: sample('proof'), receipt: sample('receipt-edited'), receiptBoundWitness: sample('receipt-bw') }), 'FAILED'],
  'provenance': ['oxyon_provenance', () => ({ boundWitness: sample('proof'), payloads: [sample('statement')] }), undefined],
}

test('every example reproduces its committed result exactly', async () => {
  const { client, close } = await connect()
  try {
    if (process.env.UPDATE_EXAMPLES) mkdirSync(resultsDir, { recursive: true })
    for (const [name, [tool, args, expected]] of Object.entries(SCENARIOS)) {
      const r = await client.callTool({ name: tool, arguments: args() })
      assert.ok(!r.isError, `${name}: ${r.content?.[0]?.text}`)
      const out = JSON.parse(r.content[0].text)
      if (expected) assert.equal(out.result, expected, name)
      const file = new URL(`${name}.json`, resultsDir)
      if (process.env.UPDATE_EXAMPLES) writeFileSync(file, JSON.stringify({ tool, result: out }, null, 2) + '\n')
      else assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).result, out, `${name} differs from examples/results`)
    }
  } finally { await close() }
})
