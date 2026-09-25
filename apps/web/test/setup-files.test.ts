import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { serveSetup, setupFiles, setupFilesPlugin } from '../setup-files.js'

/**
 * What the site serves under /setup/ for One-time updates' Copy buttons
 * (ADR 0007): the committed files, byte for byte, and nothing else.
 */
const repo = new URL('../../../', import.meta.url)
const committed = (path: string) => readFileSync(new URL(path, repo))

// Listed here independently of the plugin: every migration from 0015 on.
const expected = [
  ...readdirSync(new URL('supabase/migrations/', repo)).filter((n) => /^\d{4}_/.test(n) && n >= '0015').sort(),
  'ai-function.ts',
]

describe('the files under /setup/', () => {
  it('are every migration from 0015 on, and the AI helper, and nothing else', () => {
    expect([...setupFiles().keys()]).toEqual(expected)
    expect(expected).toContain('0016_ai_foundation.sql')
    expect(expected).not.toContain('0014_debts.sql')
  })

  it('are served by the dev server byte for byte as committed', () => {
    for (const [name, source] of setupFiles()) {
      const answer = serveSetup(`/setup/${name}?t=1`)
      expect(answer?.status, name).toBe(200)
      expect(answer?.body?.equals(readFileSync(source)), name).toBe(true)
    }
    expect(serveSetup('/setup/ai-function.ts')?.body?.equals(committed('supabase/functions/ai/index.ts'))).toBe(true)
  })

  it('answer 404 for anything else under /setup/, and leave every other path to the app', () => {
    for (const path of ['/setup/', '/setup/0014_debts.sql', '/setup/../../.env', '/setup/%2e%2e/package.json', '/setup/read-receipt.ts', '/setup/index.html']) {
      expect(serveSetup(path), path).toEqual({ status: 404, body: null })
    }
    expect(serveSetup('/')).toBeNull()
    expect(serveSetup('/assets/index.js')).toBeNull()
  })

  it('are emitted into the build byte for byte, under setup/', () => {
    const emitted: { fileName: string; source: Buffer }[] = []
    const hook = setupFilesPlugin().generateBundle
    const run = typeof hook === 'function' ? hook : hook?.handler
    run?.call({ emitFile: (f: { fileName: string; source: Buffer }) => void emitted.push(f) } as never, {} as never, {}, false)
    expect(emitted.map((f) => f.fileName)).toEqual(expected.map((n) => `setup/${n}`))
    for (const f of emitted) expect(f.source.equals(readFileSync(setupFiles().get(f.fileName.slice(6)) as URL)), f.fileName).toBe(true)
  })
})
