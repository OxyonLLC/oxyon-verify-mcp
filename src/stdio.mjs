#!/usr/bin/env node
// Oxyon Verify MCP over stdio, for local clients (Claude Code, Claude Desktop, Cursor). Verify-only: see server.mjs.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createVerifyServer } from './server.mjs'

await createVerifyServer().connect(new StdioServerTransport())
console.error('[oxyon-verify] ready (verify-only, stdio): no keys, no network')
