/**
 * The Reports' Trends (plan §2.6, A16): six or twelve whole months of
 * Income, Spent and Saved, and each Variable category against its usual
 * month, each line labelled by F37 or told when it can be. Every figure,
 * height and label is core's; this draws and formats, and never computes.
 * A month with no records is a gap in the line and "No records" in the
 * list, never $0.
 */
import { useMemo, useState } from 'react'
import { trendLines } from '@budget/chart-specs'
import type { MonthlyTrend, TrendLabel } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatCents, formatMonthTitle, formatShortMonth } from '../format.js'
import { SvgChart } from '../components/ui/chart.js'
import { cn } from '../lib/cn.js'
import { Row, Section } from '../forecast/parts.js'
import { Failed } from './Failed.js'
import { trendsOf, useTrendsRead } from './trends-read.js'

export function labelText(label: TrendLabel): string {
  switch (label.status) {
    case 'rising':
      return 'Rising steadily'
    case 'falling':
      return 'Falling steadily'
    case 'no_trend':
      return 'No clear trend'
    case 'not_enough':
      return label.possibleFrom === null ? 'Not enough months yet' : `Not enough months yet: check back in ${formatMonthTitle(label.possibleFrom)}`
  }
}

export function TrendsPanel({ asOf }: { asOf: string }) {
  const { categories } = useAppData()
  const read = useTrendsRead(asOf)
  const [months, setMonths] = useState<6 | 12>(6)
  const figures = useMemo(() => {
    if (read.status !== 'ready') return read.status
    try {
      return trendsOf(read.rows, categories, months)
    } catch {
      return 'failed' as const
    }
  }, [read, categories, months])

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Months shown" className="flex gap-1 print:hidden">
        {([6, 12] as const).map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={months === n}
            onClick={() => setMonths(n)}
            className={cn('min-h-11 rounded-md px-4 text-sm font-medium', months === n ? 'bg-secondary' : 'hover:bg-secondary/60')}
          >
            {n} months
          </button>
        ))}
      </div>
      {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your trends…</p> : null}
      {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
      {typeof figures === 'object' ? (
        <TotalsTrend trend={figures.totals} />
      ) : null}
    </div>
  )
}

function TotalsTrend({ trend }: { trend: MonthlyTrend }) {
  const { months } = trend
  const span = `${formatShortMonth(months[0]!)} to ${formatShortMonth(months[months.length - 1]!)}`
  const drawn = trend.spent.points.some((p) => p !== null)
  const lines = [
    { name: 'Income', line: trend.income, tone: 'income' as const },
    { name: 'Spent', line: trend.spent, tone: 'spent' as const },
    { name: 'Saved', line: trend.saved, tone: 'saved' as const },
  ]
  const monthText = (i: number) =>
    trend.spent.points[i] === null
      ? `${formatShortMonth(months[i]!)}: no records`
      : `${formatShortMonth(months[i]!)}: ${lines.map((l) => `${l.name.toLowerCase()} ${formatCents(l.line.points[i]!)}`).join(', ')}`
  return (
    <Section title="Income, Spent and Saved">
      <p className="text-muted-foreground">The last {months.length} whole months, {span}</p>
      {!drawn ? (
        <p>Nothing to draw yet: a trend starts from your first whole month of records. {notYet(trend.spent.label)}</p>
      ) : (
        <>
          <SvgChart
            svg={trendLines({
              id: 'trend-totals',
              title: `Income, Spent and Saved, ${span}`,
              description: months.map((_, i) => monthText(i)).join('. '),
              series: lines.map((l) => ({ name: l.name, pointsBp: l.line.pointsBp, tone: l.tone })),
              zeroBp: trend.zeroBp,
              startText: formatShortMonth(months[0]!),
              endText: formatShortMonth(months[months.length - 1]!),
            })}
            className="print:hidden"
          />
          <dl className="divide-y">
            {lines.map((l) => (
              <Row key={l.name} label={l.name} value={labelText(l.line.label)} />
            ))}
          </dl>
          <ul className="space-y-1 text-muted-foreground">
            {months.map((m, i) => (
              <li key={m} className="tnum">
                {monthText(i)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  )
}

/** The sentence an empty view ends with: the month a trend can be called, or what would start one. */
function notYet(label: TrendLabel): string {
  if (label.status !== 'not_enough') return ''
  return label.possibleFrom === null
    ? 'Bring in a statement or add a charge to begin; trends can be called once your records hold four whole months.'
    : `Trends can be called from ${formatMonthTitle(label.possibleFrom)}, when your records hold four whole months.`
}
