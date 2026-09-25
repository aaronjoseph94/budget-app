/**
 * The Reports' Overview (plan §2.6, A15): Income, Spent and Saved against
 * last month and the usual month, and the share saved. Every figure is
 * core's monthReport (F36); this draws and formats, and never computes.
 */
import type { Change, MonthReport } from '@budget/core'
import { formatBasisPoints, formatCents, formatChange, formatDateRange, formatDayMonth, formatMonthName } from '../format.js'
import { Section } from '../forecast/parts.js'

export type Reviewed = Extract<MonthReport, { readonly totals: unknown }>

/** How the two sides of the comparison are named: a whole month by its name, days so far by their dates. */
export function sidesOf(report: Reviewed): { readonly now: string; readonly before: string } {
  const last = report.lastMonth
  const { window } = report
  if (report.status !== 'so_far') return { now: formatMonthName(window.from), before: formatMonthName(last.window.from) }
  return { now: formatDateRange(window.from, window.to), before: formatDateRange(last.window.from, last.window.to) }
}

function Figure({ label, now, lines }: { label: string; now: number; lines: readonly string[] }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <dt className="min-w-0 font-medium">{label}</dt>
        <dd className="tnum whitespace-nowrap text-base font-semibold">{formatCents(now)}</dd>
      </div>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  )
}

/** Income, Spent and Saved, each with last month's figure and the usual month's, and the share saved. */
export function TotalsCard({ report, historyStart }: { report: Reviewed; historyStart: string | null }) {
  const sides = sidesOf(report)
  const last = report.lastMonth.status === 'compared' ? report.lastMonth : null
  const lines = (pick: 'income' | 'spent' | 'saved'): string[] => {
    const out: string[] = []
    if (last !== null) out.push(`${sides.before}: ${formatCents(last[pick].change.beforeCents)} · ${formatChange(last[pick].change)}`)
    const usual: Change | undefined = report.usual?.[pick]
    if (usual !== undefined) out.push(`Your usual month: ${formatCents(usual.beforeCents)} · ${formatChange(usual)}`)
    return out
  }
  const { totals } = report
  return (
    <Section title="Income, Spent and Saved">
      <p className="text-muted-foreground">
        {last === null ? sides.now : `${sides.now}, against ${sides.before}`}
      </p>
      {report.status === 'partly_recorded' && historyStart !== null ? (
        <p>Your records start on {formatDayMonth(historyStart)}, so this month is only partly recorded.</p>
      ) : null}
      {report.lastMonth.status === 'before_records' ? (
        <p className="text-muted-foreground">
          Your records start {historyStart === null ? 'later' : `on ${formatDayMonth(historyStart)}`}, so there is no {formatMonthName(report.lastMonth.window.from)} to compare with yet.
        </p>
      ) : null}
      <dl className="divide-y">
        <Figure label="Income" now={totals.incomeCents} lines={lines('income')} />
        <Figure label="Spent" now={totals.spentCents} lines={lines('spent')} />
        <Figure label="Saved" now={totals.savedCents} lines={lines('saved')} />
      </dl>
      <p>
        {totals.savingsRateBp === null
          ? 'Nothing came in, so there is no savings rate.'
          : `You saved ${formatBasisPoints(totals.savingsRateBp)} of what came in.`}
      </p>
      {report.status === 'so_far' ? <p className="text-muted-foreground">Your usual month is set beside a whole month, once this one is over.</p> : null}
    </Section>
  )
}
