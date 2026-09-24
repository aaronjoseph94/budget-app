import type { Fact } from '@budget/core'
import { dayLine } from '@budget/savings-coach'
import { CoachText } from './words.js'

/**
 * The day's line (plan §2.3), in the app's own words until the AI's arrive
 * (A12). Which summary it speaks of is savings-coach's; every figure is the
 * engine's; this draws them.
 */
const TONE = 'cheerleader'

/** The day's words and the summary they name, or null with no summary to speak of. */
export function todaysLine(facts: readonly Fact[]): { readonly text: string; readonly fact: Fact } | null {
  const line = dayLine({ facts, tone: TONE })
  const fact = line === null ? undefined : facts.find((f) => f.key === line.factKey)
  return line === null || fact === undefined ? null : { text: line.text, fact }
}

export function DayLine({ facts, className }: { facts: readonly Fact[]; className: string }) {
  const line = todaysLine(facts)
  if (line === null) return null
  return (
    <p className={className}>
      <CoachText text={line.text} facts={{ A: line.fact }} />
    </p>
  )
}
