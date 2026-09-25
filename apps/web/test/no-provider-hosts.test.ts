import { describe, expect, it } from 'vitest'

/**
 * The browser never talks to an AI service, and never holds a key that
 * could (CLAUDE.md; ADR 0004): every AI call goes through the `ai` helper
 * on the Supabase project, the one address besides the site that the
 * Content-Security-Policy allows (headers.test.ts). So no provider's API
 * host, and no name of the service-role key, is anywhere in the app's
 * source. `scripts/check-bundle.mjs` checks the same of the built
 * JavaScript, leaving out /setup/, which is the helper's own source.
 */
const PROVIDER_HOSTS = [
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'openrouter.ai/api',
  'api.openai.com',
  'api.anthropic.com',
] as const

const sources = import.meta.glob<string>('../src/**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true })

describe('the app’s source', () => {
  it('is read in full: every folder of it', () => {
    const folders = new Set(Object.keys(sources).map((path) => path.split('/').slice(2, -1).join('/')))
    for (const folder of ['', 'ai', 'help', 'screens', 'coach', 'components/ui']) expect(folders.has(folder), folder).toBe(true)
    expect(Object.keys(sources).length).toBeGreaterThan(50)
  })

  it('names no AI service’s API host', () => {
    for (const [path, text] of Object.entries(sources)) {
      for (const host of PROVIDER_HOSTS) expect(text.toLowerCase().includes(host), `${host} in ${path}`).toBe(false)
    }
  })

  it('names no service-role key', () => {
    for (const [path, text] of Object.entries(sources)) expect(text, path).not.toMatch(/SERVICE_ROLE/)
  })
})
