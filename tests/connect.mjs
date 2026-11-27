// An in-memory MCP client connected to a fresh verify-only server.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createVerifyServer } from '../src/server.mjs'

export async function connect() {
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = createVerifyServer()
  const client = new Client({ name: 'boundary-test', version: '0' })
  await Promise.all([server.connect(a), client.connect(b)])
  return { client, close: () => Promise.all([client.close(), server.close()]) }
}
