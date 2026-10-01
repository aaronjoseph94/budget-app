import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { PINNED, banner, bundleMcpFunction } from '../build.js'
import { AI_APP_TOKEN, ENV, PROJECT, fakeFetch } from './fake-auth.js'

/**
 * The file the owner pastes as the Edge Function `mcp` (PLAN §2.2, §2.13
 * mcp-bundle): built as the site builds it, held to importing nothing
 * and to naming no key, then imported and run as Deno would run it.
 */

let code = ''
let serve: ((req: Request) => Promise<Response>) | undefined
const out = new URL('../dist/bundle-test/', import.meta.url)

beforeAll(async () => {
  code = await bundleMcpFunction()
  mkdirSync(out, { recursive: true })
  const file = new URL('mcp-function.ts', out)
  writeFileSync(file, code)
  vi.stubGlobal('fetch', fakeFetch().fetchFn)
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => (ENV as Record<string, string>)[name] },
    serve: (fn: (req: Request) => Promise<Response>) => {
      serve = fn
    },
  })
  await import(/* @vite-ignore */ file.href)
}, 60_000)

afterAll(() => {
  vi.unstubAllGlobals()
  rmSync(out, { recursive: true, force: true })
})

// Statements only, as check-bundle.mjs reads them: the file keeps the
// engine's comments, and a comment's words are not an import. Comment
// lines go first: the bundled SDK's JSDoc names types as import('…').
const statements = (text: string) => text.split('\n').filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line)).join('\n')
const specifiers = (text: string) =>
  [...statements(text).matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3],
  )

describe('the pasteable file', () => {
  it('opens with its banner, naming its version', () => {
    expect(code.split('\n')[0]).toBe(banner(MCP_SERVER_VERSION))
  })

  // Security review mcp-3-04: the SDK and zod are bundled at the versions in
  // pnpm-lock.yaml, so no deploy resolves a version nobody reviewed.
  it('imports nothing at all: the SDK and zod are inside it, at the locked versions', () => {
    expect(specifiers(code)).toEqual([])
    expect(PINNED).toEqual({})
    expect(code).not.toMatch(/from\s*["']npm:|from\s*["']node:/)
  })

  it('names no service key and no AI service', () => {
    expect(code).not.toMatch(/service_role|secret_keys|sb_secret_|api\.openai\.com|api\.anthropic\.com|generativelanguage|api\.groq\.com|openrouter\.ai/i)
  })

  it('serves initialize, server/discover and tools/list under Deno', async () => {
    const post = (body: unknown, headers: Record<string, string>) =>
      serve?.(
        new Request(`${PROJECT}/mcp`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${AI_APP_TOKEN}`, ...headers },
          body: JSON.stringify(body),
        }),
      )
    const meta = {
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientInfo': { name: 'c', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    }
    const init = await post(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'c', version: '1' } } },
      {},
    )
    expect(await init?.text()).toContain(`"serverInfo":{"name":"budget","version":"${MCP_SERVER_VERSION}"}`)
    for (const method of ['server/discover', 'tools/list']) {
      const res = await post({ jsonrpc: '2.0', id: 2, method, params: { _meta: meta } }, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method })
      expect(res?.status, method).toBe(200)
      expect(((await res?.json()) as { result: { resultType: string } }).result.resultType, method).toBe('complete')
    }
  })
})
