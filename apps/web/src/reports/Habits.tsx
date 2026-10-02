/**
 * The Reports' Habits (plan §2.6, A18): everyday spending day by day
 * against a daily allowance, which weekday costs most, weeks kept within
 * budget, and personal bests. Every figure, level and length is core's
 * (F40); this draws and formats, and never computes. A day before the
 * records or still to come is left blank and listed as such, never $0.
 */
import { useCallback, useMemo } from 'react'
import { heatGrid, weekdayBars } from '@budget/chart-specs'
import type { GridDay, GridLevel, PersonalBests, SpendingGrid, Streaks, WeekdayPattern } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatCents, formatDayMonth, formatIsoDate, formatMagnitude, formatMonthTitle } from '../format.js'
import { hashOf } from '../nav.js'
import { SvgChart, fitted } from '../components/ui/chart.js'
import { Row, Section } from '../forecast/parts.js'
import { Failed } from './Failed.js'
import { habitsOf, useHabitsRead } from './habits-read.js'

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** The last complete weeks listed under a streak. */
const WEEKS_LISTED = 8
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
  const nameOf = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? 'a category', [categories])

  return (
    <div className="space-y-4">
      {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your habits…</p> : null}
      {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
      {typeof figures === 'object' ? (
        // Two across from 1280px, as the Overview's sections (Mockup A step 8).
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2 xl:gap-5">
          <GridCard grid={figures.grid} />
          <StreakCard streaks={figures.streaks} />
          <WeekdayCard pattern={figures.pattern} />
          <BestsCard bests={figures.bests} nameOf={nameOf} />
        </div>
      ) : null}
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
      <Section title="Your spending grid" large>
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
    <Section title="Your spending grid" large>
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
          className="mx-auto max-w-md"
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

const link = 'inline-flex min-h-11 items-center font-medium underline underline-offset-4'
const weeksText = (n: number) => (n === 1 ? '1 week' : `${n} weeks`)

function StreakCard({ streaks }: { streaks: Streaks }) {
  if (streaks.status === 'no_budget') {
    return (
      <Section title="Weeks within budget" large>
        <p>Set a weekly budget for your everyday spending, and each week you stay within it counts toward a streak.</p>
        <a href={hashOf({ screen: 'week', param: null })} className={link}>
          Open the Week
        </a>
      </Section>
    )
  }
  const { weeks, current, best, bestEnded } = streaks
  if (weeks.length === 0) {
    return (
      <Section title="Weeks within budget" large>
        <p>Streaks start once your records hold a whole week, Monday to Sunday.</p>
      </Section>
    )
  }
  return (
    <Section title="Weeks within budget" large>
      {current > 0 && current === best ? <p className="font-medium">Your best run yet. Keep it going!</p> : null}
      <dl className="divide-y">
        <Row label="In a row now" value={weeksText(current)} />
        <Row label="Your longest run" value={bestEnded === null ? 'none yet' : weeksText(best)} />
      </dl>
      {bestEnded === null ? null : <p className="text-muted-foreground">Your longest run ended with the week of {formatDayMonth(bestEnded)}.</p>}
      <p className="text-muted-foreground">A week counts when the Week’s Left to spend stays at $0.00 or more.</p>
      <ul className="space-y-1">
        {weeks.slice(-WEEKS_LISTED).reverse().map((w) => (
          <li key={w.start} className="tnum">
            Week of {formatDayMonth(w.start)}: {w.kept ? `✓ within budget, ${formatCents(w.leftCents)} left` : `✗ ${formatMagnitude(w.leftCents)} over`}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function WeekdayCard({ pattern }: { pattern: WeekdayPattern }) {
  if (pattern.status === 'not_enough') {
    return (
      <Section title="Which weekday costs most" large>
        <p>
          {pattern.possibleFrom === null
            ? 'Bring in a statement or add a charge to begin; this needs four whole weeks of records.'
            : `This needs four whole weeks of records: check back on Monday ${formatIsoDate(pattern.possibleFrom)}.`}
        </p>
      </Section>
    )
  }
  const { days, costliest, weeks, from, to } = pattern
  const span = `the last ${weeks} whole weeks, ${formatDayMonth(from)} to ${formatDayMonth(to)}`
  return (
    <Section title="Which weekday costs most" large>
      <p>
        {costliest === null
          ? `Nothing spent on any weekday over ${span}.`
          : `${WEEKDAY_NAMES[costliest - 1]} costs most: ${formatCents(days[costliest - 1]!.averageCents)} on average, over ${span}.`}
      </p>
      <SvgChart
        svg={fitted(weekdayBars, {
          id: 'weekday-bars',
          title: 'Everyday spending on each weekday, on average',
          description: days.map((x, i) => `${WEEKDAY_NAMES[i]} ${formatCents(x.averageCents)}`).join(', '),
          bars: days.map((x, i) => ({ label: WEEKDAYS[i]!, valueText: formatCents(x.averageCents), goalBp: x.trackBp, actualBp: x.barBp })),
        })}
        className="mx-auto max-w-md"
      />
      {pattern.allowanceCents === null ? null : (
        <p className="text-muted-foreground">Each track is your daily allowance, {formatCents(pattern.allowanceCents)}.</p>
      )}
    </Section>
  )
}

function BestsCard({ bests, nameOf }: { bests: PersonalBests; nameOf: (id: string) => string }) {
  if (bests.status === 'not_enough') {
    return (
      <Section title="Personal bests" large>
        <p>
          {bests.possibleFrom === null
            ? 'Bring in a statement or add a charge to begin; a best needs three whole months of records.'
            : `A best needs three whole months of records: check back in ${formatMonthTitle(bests.possibleFrom)}.`}
        </p>
      </Section>
    )
  }
  const month = formatMonthTitle(bests.month)
  return (
    <Section title="Personal bests" large>
      {bests.bests.length === 0 ? (
        <p>No personal best in {month}. One shows when a category’s whole month is its lowest of the last {bests.months}.</p>
      ) : (
        <ul className="divide-y">
          {bests.bests.map((b) => (
            <li key={b.categoryId} className="py-2">
              <p className="font-medium [overflow-wrap:anywhere]">{nameOf(b.categoryId)}</p>
              <p className="tnum text-muted-foreground">
                {formatCents(b.cents)} in {month}, your lowest in {bests.months} whole months. Next lowest: {formatCents(b.nextCents)} in{' '}
                {formatMonthTitle(b.nextMonth)}.
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
