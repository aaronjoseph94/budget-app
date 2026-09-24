import { describe, expect, it } from 'vitest'
// Whole, as written: vitest.config.ts lets this one stylesheet through.
import css from '../src/index.css?raw'

/**
 * iPhone Safari zooms the whole page into a field whose text is under 16px
 * as it takes focus. A 16px rule inside `@layer base` loses to any utility,
 * and `text-sm` on a field undid it on sign-in, Setup and Paycheck (FE-9).
 * The floor has to sit outside every layer, where no utility can undercut it.
 */
function unlayered(text: string): string {
  let out = ''
  let depth = 0
  let layered = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (c === '{') {
      depth += 1
      if (layered === 0 && /@layer[^{;]*$/.test(text.slice(Math.max(0, i - 40), i))) layered = depth
    }
    if (layered === 0) out += c
    if (c === '}') {
      if (depth === layered) layered = 0
      depth -= 1
    }
  }
  return out
}

describe('the 16px floor on fields', () => {
  it('is set outside every layer, for touch screens', () => {
    const rule = /@media \(pointer: coarse\)\s*\{\s*input,\s*select,\s*textarea\s*\{\s*font-size:\s*max\(16px, 1em\);/
    expect(unlayered(css)).toMatch(rule)
  })
})
