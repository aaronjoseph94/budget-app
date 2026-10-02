import type { ReactNode } from 'react'
import type { Change, PeriodComparison } from '@budget/core'
import { formatBasisPoints, formatCents, formatChange, formatDateRange, formatDayMonth } from '../format.js'
import { TryAgain } from '../try-again.js'

/**
 * One period beside the one before it (D26, F25): both figures, both windows
 * and the change in words, every figure periodComparison's. Never set under
 * the screen's own Spent: a same-days window counts a planned bill only on
 * its due day (F8), so the two can differ, and each names its own days.
 *
 * `earlier` names the period before in words ("last week"). With the earlier
 * days before the records (F24) the line says what would make a comparison
 * possible; when they could not be read, it says so in one line and the
 * screen around it still shows.
 */
export function CompareLine({
  comparison,
  label,
  earlier,
  pick = (c) => c.summary.spent,
  word = 'spent',
  day = formatDayMonth,
}: {
  /** Null while it loads; 'failed' when the earlier window could not be read. */
  comparison: PeriodComparison | 'failed' | null
  /** The group's name for a screen reader: "Compared with last week". */
  label: string
  earlier: string
  pick?: (c: Extract<PeriodComparison, { status: 'compared' }>) => Change
  word?: string
  /** How the day the records start is written; the Year adds its year. */
  day?: (isoDate: string) => string
}) {
  if (comparison === null || (comparison !== 'failed' && comparison.status === 'not_started')) return null
  const line = (children: ReactNode) => (
    <div role="group" aria-label={label} className="mt-3 border-t border-current/20 pt-3 text-sm">
      {children}
    </div>
  )
  if (comparison === 'failed') {
    return line(<p>{sentence(earlier)} did not load, so there is no comparison. <TryAgain />.</p>)
  }
  if (comparison.status === 'before_records') {
    return line(
      <p>
        {comparison.historyStart === null
          ? `Import a statement to compare with ${earlier}.`
          : `Your records start on ${day(comparison.historyStart)}. Import the statement before that to compare with ${earlier}.`}
      </p>,
    )
  }
  const c = pick(comparison)
  return line(
    <>
      {/* Each side kept whole where it fits, so a date range never breaks
        from its figure. The dot starts the second side, so it never ends a
        line or stands on one alone (V7), and a figure keeps its word, which
        in a narrow card stood on a line alone. */}
      <p>
        <span className="inline-block">
          {formatDateRange(comparison.now.from, comparison.now.to)}:{' '}
          <span className="whitespace-nowrap">
            <span className="tnum font-semibold">{formatCents(c.nowCents)}</span> {word}
          </span>
        </span>{' '}
        <span className="inline-block">
          · {formatDateRange(comparison.before.from, comparison.before.to)}: <span className="tnum font-semibold">{formatCents(c.beforeCents)}</span>
        </span>
      </p>
      <p className="mt-0.5 font-medium">
        {c.direction === 'same' ? (
          'About the same'
        ) : (
          <>
            <span aria-hidden="true">{c.direction === 'more' ? '▲ ' : '▼ '}</span>
            {formatChange(c)}
            {c.changeBp === null ? '' : ` (${formatBasisPoints(Math.abs(c.changeBp))})`}
          </>
        )}
      </p>
    </>,
  )
}

/** "last week" as the start of a sentence. Display only. */
function sentence(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1)
}
