import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BUILT, serveSetup, setupFiles, setupFilesPlugin } from '../setup-files.js'

/**
 * What the site serves under /setup/ for One-time updates' Copy buttons
 * (ADR 0007): the committed files, byte for byte, the AI apps server built
 * from its package (ADR 0012), and nothing else.
 */
const repo = new URL('../../../', import.meta.url)
const committed = (path: string) => readFileSync(new URL(path, repo))

// Listed here independently of the plugin: every migration from 0015 on.
const expected = [
  ...readdirSync(new URL('supabase/migrations/', repo)).filter((n) => /^\d{4}_/.test(n) && n >= '0015').sort(),
  'ai-function.ts',
  'read-receipt-function.ts',
]

describe('the files under /setup/', () => {
  it('are every migration from 0015 on, the AI helper and read-receipt, and nothing else', () => {
    expect([...setupFiles().keys()]).toEqual(expected)
    expect(expected).toContain('0016_ai_foundation.sql')
    expect(expected).not.toContain('0014_debts.sql')
  })

  it('are served by the dev server byte for byte as committed', async () => {
    for (const [name, source] of setupFiles()) {
      const answer = await serveSetup(`/setup/${name}?t=1`)
      expect(answer?.status, name).toBe(200)
      expect(answer?.body?.equals(readFileSync(source)), name).toBe(true)
    }
    expect((await serveSetup('/setup/ai-function.ts'))?.body?.equals(committed('supabase/functions/ai/index.ts'))).toBe(true)
    expect((await serveSetup('/setup/read-receipt-function.ts'))?.body?.equals(committed('supabase/functions/read-receipt/index.ts'))).toBe(true)
  })

  it('serve the AI apps server as it is built', async () => {
    const answer = await serveSetup(`/setup/${BUILT}?t=1`, setupFiles(), async () => '// built')
    expect(answer).toEqual({ status: 200, body: Buffer.from('// built') })
  })

  it('answer 404 for anything else under /setup/, and leave every other path to the app', async () => {
    for (const path of ['/setup/', '/setup/0014_debts.sql', '/setup/../../.env', '/setup/%2e%2e/package.json', '/setup/read-receipt.ts', '/setup/index.html']) {
      expect(await serveSetup(path), path).toEqual({ status: 404, body: null })
    }
    expect(await serveSetup('/')).toBeNull()
    expect(await serveSetup('/assets/index.js')).toBeNull()
  })

  it('are emitted into the build, the committed ones byte for byte, under setup/', async () => {
    const emitted: { fileName: string; source: Buffer | string }[] = []
    const hook = setupFilesPlugin().generateBundle
    const run = typeof hook === 'function' ? hook : hook?.handler
    await run?.call({ emitFile: (f: { fileName: string; source: Buffer }) => void emitted.push(f) } as never, {} as never, {}, false)
    expect(emitted.map((f) => f.fileName)).toEqual([...expected, BUILT].map((n) => `setup/${n}`))
    for (const f of emitted.slice(0, -1)) {
      expect(Buffer.from(f.source).equals(readFileSync(setupFiles().get(f.fileName.slice(6)) as URL)), f.fileName).toBe(true)
    }
    expect(String(emitted.at(-1)?.source)).toMatch(/^\/\/ mcp-function\.ts — /)
  }, 60_000)
})
