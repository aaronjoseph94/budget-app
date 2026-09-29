import { useEffect, useMemo } from 'react'
import { isoDate, shiftWeek, type Fact } from '@budget/core'
import { LIBRARY, pickQuote, quoteTags, type LibraryEntry } from '@budget/savings-coach'
import type { ListedGoalRow } from '../ledger.js'
import { Said } from './CoachCards.js'
import type { Words } from './narration.js'

/**
 * A quote or tip that fits today (plan §2.3, §4): from the committed
 * library only, chosen by savings-coach from what today's cards are about
 * and the main goal, never one this device showed in the last fortnight.
 * The words and the name are the library's, drawn as text; the AI may
 * pick among the same shortlist and add a line on why it fits (A12).
 */
/** Today's shortlist and the app's own pick from it, from what today is about. */
export function useQuotePick(facts: readonly Fact[], goal: ListedGoalRow | null, asOf: string): { readonly shortlist: readonly LibraryEntry[]; readonly entry: LibraryEntry | null } {
  return useMemo(() => {
    const tags = quoteTags({
      facts,
      goal: goal === null ? null : { name: goal.name, unitLabel: goal.unit_label, hasHours: goal.unit_cost_cents !== null },
    })
    const picked = pickQuote({ tags, asOf: isoDate(asOf), recentIds: shownBefore(asOf) })
    return { shortlist: picked.shortlist.flatMap((id) => LIBRARY.filter((e) => e.id === id)), entry: picked.entry }
  }, [facts, goal, asOf])
}

/** The quote shown, and, when the AI chose it from today's shortlist, its line on why it fits (✨). */
export function QuoteCard({ entry, why, asOf }: { entry: LibraryEntry | null; why: Words | null; asOf: string }) {
  useEffect(() => {
    if (entry !== null) remember(entry.id, asOf)
  }, [entry, asOf])

  if (entry === null) return null
  return (
    <section aria-label="A quote for today">
      <figure className="space-y-2.5 rounded-xl border bg-muted p-4 md:px-6 md:py-[1.375rem]">
        {entry.kind === 'tip' ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">A tip</p> : null}
        <blockquote className="whitespace-pre-line text-base leading-relaxed [overflow-wrap:anywhere] md:text-[1.0625rem]">
          {entry.kind === 'quote' ? `“${entry.text}”` : entry.text}
        </blockquote>
        <figcaption className="space-y-1 text-sm text-muted-foreground">
          <p>{byline(entry)}</p>
          {entry.note === null ? null : <p className="text-xs">{entry.note}</p>}
        </figcaption>
        {why === null ? null : (
          <p className="words-in text-sm [overflow-wrap:anywhere]">
            <Said words={why} />
          </p>
        )}
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
