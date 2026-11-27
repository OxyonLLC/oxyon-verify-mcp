// The publication gate (owner, Sprint 002F): the public interface cannot perform or reach privileged operations.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { TOOLS } from '../src/server.mjs'
import { connect } from './connect.mjs'

const SRC = new URL('../src/', import.meta.url)
const sources = readdirSync(SRC).filter((f) => f.endsWith('.mjs')).map((f) => [f, readFileSync(new URL(f, SRC), 'utf8')])


test('exactly the five verify-only tools are exposed', async () => {
  const { client, close } = await connect()
  try {
    const names = (await client.listTools()).tools.map((t) => t.name).sort()
    assert.deepEqual(names, [...TOOLS].sort())
    for (const n of names) assert.doesNotMatch(n, /attest|sign|anchor|revoke|supersede|rotate|wallet|admin|send|key/i)
  } finally { await close() }
})

test('privileged tool names are not callable', async () => {
  const { client, close } = await connect()
  try {
    for (const name of ['geoproof_attest', 'geoproof_receipt', 'geoproof_anchor', 'geoproof_revoke', 'geoproof_supersede', 'geoproof_rotate']) {
      const r = await client.callTool({ name, arguments: {} }).catch((e) => ({ isError: true, thrown: String(e) }))
      assert.equal(r.isError, true, name)
    }
  } finally { await close() }
})

test('the source imports nothing that can sign, hold keys, read secrets or reach the network', () => {
  const ALLOWED = new Set(['@modelcontextprotocol/sdk/server/mcp.js', '@modelcontextprotocol/sdk/server/stdio.js', 'zod',
    '@xyo-network/boundwitness-validator', '@xyo-network/payload-builder', './server.mjs'])
  for (const [file, text] of sources) {
    for (const [, spec] of text.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) assert.ok(ALLOWED.has(spec), `${file} imports ${spec}`)
    assert.doesNotMatch(text, /\bimport\(/, `${file}: no dynamic import`)
    assert.doesNotMatch(text, /process\.env|readFile|writeFile|node:fs|node:child_process|node:net|node:http|fetch\(|XMLHttpRequest|WebSocket/, `${file}: no env, files or network`)
    assert.doesNotMatch(text, /BoundWitnessBuilder|Account\.|\.signer\(|derivePath|mnemonic|privateKey|generateXyo/, `${file}: no signing or keys`)
  }
})
