import { describe, expect, it } from 'vitest'
import css from '../src/index.css?raw'
import { STEP_IDS, STEP_WORDS } from '../src/start/steps.js'

/** The words plan §8 keeps out of what the owner reads. */
const ENGINEERING = /\b(migrations?|edge functions?|postgres|sql|rls|jwt|endpoints?|api|schema|database|metadata)\b/i

describe('Getting started’s words (plan §8.1)', () => {
  it('give every step a title, one sentence on why, and how long it takes, in plain words', () => {
    expect(STEP_IDS).toHaveLength(9)
    for (const id of STEP_IDS) {
      const { title, why, time } = STEP_WORDS[id]
      expect(title.trim(), id).not.toBe('')
      expect(why, id).toMatch(/^[A-Z].*\.$/)
      expect(time, id).toMatch(/^(under a minute|about \d+ minutes?|under \d+ minutes)$/)
      expect(`${title} ${why}`, id).not.toMatch(ENGINEERING)
    }
  })

  it('lets the finish’s paper plane fly only for those who have not asked for less motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce) {\n  .start-fly'))
    expect(reduced).toMatch(/^@media \(prefers-reduced-motion: reduce\) \{\s*\.start-fly \{\s*animation: none;/)
    expect(css).toMatch(/\.start-fly \{\s*animation: start-fly /)
  })
})
