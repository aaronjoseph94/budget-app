import { useMemo } from 'react'
import type { Category } from '../ledger.js'
import { navigate } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { todaysLine } from '../coach/CoachCards.js'
import { digestOf, type DigestRows } from '../coach/facts.js'
import { CoachText } from '../coach/words.js'

/**
 * The Month's coach line (plan §2.2, D27): the Coach's day's line, above
 * the summary, and a tap to the Coach. Built only from what the Month
 * already read, this month and last, so it costs no read of its own; the
 * summaries it speaks of need nothing more (F27), so it is the Coach's
 * very line. Loaded after the Month draws, as its own chunk, inside an
 * error boundary: if the digest throws, the line is simply not there.
 */
export default function MonthCoachLine({ read, categories }: { read: DigestRows; categories: readonly Category[] }) {
  // An engine refusal throws here, during render, for the boundary to catch.
  const line = useMemo(() => todaysLine(digestOf(read, categories).facts), [read, categories])
  if (line === null) return null
  return (
    <button
      type="button"
      onClick={() => navigate('coach')}
      className="flex min-h-11 w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left text-sm shadow-sm transition-colors hover:bg-accent"
    >
      <span className="min-w-0 flex-1">
        <CoachText text={line.text} facts={{ A: line.fact }} />
        <span className="sr-only"> Open the Coach.</span>
      </span>
      <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
