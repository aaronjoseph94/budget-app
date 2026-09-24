import { describe, expect, it } from 'vitest'
import { base64Of } from '../src/receipt.js'

describe('base64Of (PERF-9)', () => {
  it('encodes bytes across slice boundaries exactly as Node does', () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, i) => (i * 31) % 256)
    expect(base64Of(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    expect(base64Of(new Uint8Array())).toBe('')
  })
})
