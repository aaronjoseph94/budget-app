import { describe, expect, it } from 'vitest'
import { byName } from '../src/order.js'

// byName is the one place core names a collation locale (F53). These cases
// hold whatever the process locale is, so they fail in CI's default locale
// too. What they cannot see is a bare `a.localeCompare(b)` put back in its
// place: under an English process locale that sorts the same as byName.
// The no-restricted-syntax rule in eslint.config.js is the guard for that.
describe('byName', () => {
  it('reads a lower-case name before a capital later in the alphabet, unlike code-point order', () => {
    // By code point 'Z' (U+005A) comes before 'a' (U+0061).
    expect(['Zoo', 'apple'].sort()).toEqual(['Zoo', 'apple'])
    expect(['Zoo', 'apple'].sort(byName)).toEqual(['apple', 'Zoo'])
  })

  it('reads Ä as A, in English order, not in Swedish order where Ä comes after Z', () => {
    const names = ['Zoo', 'Ärenden', 'apple']
    expect([...names].sort(new Intl.Collator('sv').compare)).toEqual(['apple', 'Zoo', 'Ärenden'])
    expect([...names].sort(byName)).toEqual(['apple', 'Ärenden', 'Zoo'])
  })
})
