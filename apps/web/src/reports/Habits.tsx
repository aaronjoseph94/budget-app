/**
 * The Reports' Habits (plan §2.6, A18): everyday spending day by day
 * against a daily allowance, which weekday costs most, weeks kept within
 * budget, and personal bests. Every figure, level and length is core's
 * (F40); this draws and formats, and never computes. A day before the
 * records or still to come is left blank and listed as such, never $0.
 */
import { useMemo } from 'react'
import { heatGrid } from '@budget/chart-specs'
import type { GridDay, GridLevel, SpendingGrid } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatCents, formatDayMonth } from '../format.js'
import { SvgChart } from '../components/ui/chart.js'
import { Row, Section } from '../forecast/parts.js'
import { Failed } from './Failed.js'
import { habitsOf, useHabitsRead } from './habits-read.js'

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LEVEL: Readonly<Record<GridLevel, { readonly n: 0 | 1 | 2 | 3 | 4; readonly words: string }>> = {
  none: { n: 0, words: 'nothing spent' },
  half: { n: 1, words: 'up to half the allowance' },
  all: { n: 2, words: 'up to the allowance' },
  one_and_half: { n: 3, words: 'up to one and a half times the allowance' },
  more: { n: 4, words: 'over one and a half times the allowance' },
}

export function HabitsPanel({ asOf }: { asOf: string }) {
  const { categories } = useAppData()
  const read = useHabitsRead(asOf)
  const figures = useMemo(() => {
    if (read.status !== 'ready') return read.status
    try {
      return habitsOf(read.rows, categories)
    } catch {
      return 'failed' as const
    }
  }, [read, categories])

  return (
    <div className="space-y-4">
      {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your habits…</p> : null}
      {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
      {typeof figures === 'object' ? <GridCard grid={figures.grid} /> : null}
    </div>
  )
}

function allowanceText(grid: SpendingGrid): string {
  const { cents, from } = grid.allowance
  if (cents === null || from === 'none') return 'Nothing spent yet to set a day against.'
  return from === 'budgets'
    ? `Against ${formatCents(cents)} a day: your weekly budgets spread over the week.`
    : `Against ${formatCents(cents)} a day: your usual day of spending, since no weekly budget is set. Set one on the Week to use your own.`
}

function dayText(day: GridDay, weekday: string): string {
  if (day.status === 'no_records') return `${weekday} no records`
  if (day.status === 'to_come' || day.spentCents === null) return `${weekday} to come`
  return `${weekday} ${formatCents(day.spentCents)}`
}

function GridCard({ grid }: { grid: SpendingGrid }) {
  if (grid.weeks.length === 0) {
    return (
      <Section title="Your spending grid">
        <p>Bring in a statement or add a charge, and each day’s everyday spending shows here.</p>
      </Section>
    )
  }
  const first = grid.weeks[0]!.start
  const last = grid.weeks[grid.weeks.length - 1]!.start
  const weekLine = (i: number) => {
    const w = grid.weeks[i]!
    return `Week of ${formatDayMonth(w.start)}: ${formatCents(w.spentCents)} · ${w.days.map((x, d) => dayText(x, WEEKDAYS[d]!)).join(', ')}`
  }
  return (
    <Section title="Your spending grid">
      <p className="text-muted-foreground">
        Everyday spending (Variable expenses), each day of the last {grid.weeks.length} weeks. {allowanceText(grid)}
      </p>
      <div className="overflow-x-auto">
        <SvgChart
          svg={heatGrid({
            id: 'spending-grid',
            title: `Everyday spending, day by day, from ${formatDayMonth(first)}`,
            description: grid.weeks.map((_, i) => weekLine(i)).join('. '),
            rowLabels: ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'],
            weeks: grid.weeks.map((w) =>
              w.days.map((x, d) =>
                x.level === null || x.spentCents === null
                  ? null
                  : { level: LEVEL[x.level].n, title: `${WEEKDAYS[d]} ${formatDayMonth(x.date)}: ${formatCents(x.spentCents)}, ${LEVEL[x.level].words}` },
              ),
            ),
            startText: formatDayMonth(first),
            endText: formatDayMonth(last),
          })}
          className="max-w-2xl"
        />
      </div>
      <dl className="divide-y">
        <Row label="Days with no everyday spending" value={`${grid.noSpendDays} of ${grid.recordedDays}`} />
        {(['half', 'all', 'one_and_half', 'more'] as const).map((level) => (
          <Row key={level} label={`Days ${LEVEL[level].words}`} value={`${grid.levels[level]}`} />
        ))}
      </dl>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium">Each week’s figures</summary>
        <ul className="space-y-1 text-muted-foreground">
          {grid.weeks.map((w, i) => (
            <li key={w.start} className="tnum">
              {weekLine(i)}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  )
}
