/**
 * The day's line: one sentence on how the spending is going (plan §2.2,
 * §2.3), shown at the top of the Coach and on the Month.
 *
 * It is made from the summaries alone, this month and this week against the
 * same days before, which the Month can compute from the two months it
 * already reads; so the Month's line and the Coach's are the same line.
 * This month's, when the records reach last month's same days; otherwise
 * this week's; otherwise none.
 */
import type { Fact } from '@budget/core'
import { LINE_TEMPLATES, type LineKey, type Tone } from './templates.js'

export interface DayLine {
  /** Words with the summary's blanks, as `{{A.change}}`. */
  readonly text: string
  /** The fact `A` names. */
  readonly factKey: string
}

export function dayLine(input: { readonly facts: readonly Fact[]; readonly tone: Tone }): DayLine | null {
  const fact = input.facts.find((f) => f.kind === 'month_so_far') ?? input.facts.find((f) => f.kind === 'week_so_far')
  if (fact === undefined) return null
  const key: LineKey = `${fact.kind === 'month_so_far' ? 'month' : 'week'}_${fact.meaning}`
  return { text: LINE_TEMPLATES[key][input.tone], factKey: fact.key }
}
