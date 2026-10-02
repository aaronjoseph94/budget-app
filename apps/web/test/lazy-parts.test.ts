import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>('../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })

describe('a part fetched on first use', () => {
  it('is declared through lazyPart, so the DOM tests fetch it before they draw (test/setup-dom.ts)', () => {
    const direct = Object.entries(sources)
      .filter(([path, text]) => path !== '../src/lib/lazy-part.ts' && /\blazy\s*\(/.test(text))
      .map(([path]) => path)
    expect(direct).toEqual([])
  })

  it('is found by the check above', () => {
    expect(/\blazy\s*\(/.test(sources['../src/lib/lazy-part.ts'] ?? '')).toBe(true)
  })
})
