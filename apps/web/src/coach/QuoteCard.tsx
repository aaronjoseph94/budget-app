import { useEffect, useMemo } from 'react'
import { isoDate, shiftWeek, type Fact } from '@budget/core'
import { pickQuote, quoteTags, type LibraryEntry } from '@budget/savings-coach'
import type { ListedGoalRow } from '../ledger.js'

/**
 * A quote or tip that fits today (plan §2.3, §4): from the committed
 * library only, chosen by savings-coach from what today's cards are about
 * and the main goal, never one this device showed in the last fortnight.
 * The words and the name are the library's, drawn as text; the AI may
 * later pick among the same shortlist and add a line on why it fits (A12).
 */
export function QuoteCard({ facts, goal, asOf }: { facts: readonly Fact[]; goal: ListedGoalRow | null; asOf: string }) {
  const entry = useMemo(() => {
    const tags = quoteTags({
      facts,
      goal: goal === null ? null : { name: goal.name, unitLabel: goal.unit_label, hasHours: goal.unit_cost_cents !== null },
    })
    return pickQuote({ tags, asOf: isoDate(asOf), recentIds: shownBefore(asOf) }).entry
  }, [facts, goal, asOf])

  useEffect(() => {
    if (entry !== null) remember(entry.id, asOf)
  }, [entry, asOf])

  if (entry === null) return null
  return (
    <section aria-label="A quote for today">
      <figure className="space-y-2 rounded-xl border bg-card p-4 shadow-sm">
        {entry.kind === 'tip' ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A tip</p> : null}
        <blockquote className="whitespace-pre-line text-base leading-relaxed [overflow-wrap:anywhere]">
          {entry.kind === 'quote' ? `“${entry.text}”` : entry.text}
        </blockquote>
        <figcaption className="space-y-1 text-sm text-muted-foreground">
          <p>{byline(entry)}</p>
          {entry.note === null ? null : <p className="text-xs">{entry.note}</p>}
        </figcaption>
      </figure>
    </section>
  )
}

/** Who, and where: the book or speech, its year and place in it (plan §4). */
function byline(e: LibraryEntry): string {
  if (e.attribution === 'often_attributed') return `Often attributed to ${e.by}; not found in their own writing.`
  const titled = `${e.source.title}${e.source.year === null ? '' : ` (${e.source.year})`}`
  // A tip is the app's wording of the source's advice, so it names whose advice, not a page.
  if (e.kind === 'tip') return `Advice from ${e.by}: ${titled}`
  return e.source.locator === null ? `${e.by}, ${titled}` : `${e.by}, ${titled}, ${e.source.locator}`
}

/** What this device showed, by id, with the day: kept only here, for a fortnight. */
const SHOWN_KEY = 'budget.coach.quotes'

function readShown(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SHOWN_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null) return {}
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'))
  } catch {
    // Storage blocked or garbled: every quote counts as not shown lately.
    return {}
  }
}

/** Ids shown in the 14 days before today. Today's own pick is not among them, so it holds all day. */
function shownBefore(asOf: string): string[] {
  const from = shiftWeek(isoDate(asOf), -2)
  return Object.entries(readShown())
    .filter(([, day]) => day >= from && day < asOf)
    .map(([id]) => id)
}

function remember(id: string, asOf: string): void {
  const from = shiftWeek(isoDate(asOf), -2)
  const kept = Object.fromEntries(Object.entries(readShown()).filter(([, day]) => day >= from))
  try {
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify({ ...kept, [id]: asOf }))
  } catch {
    // Storage blocked: the pick still holds all day, by the day's rotation.
  }
}
