import { useMemo, useState } from 'react'
import { isoDate, whatIf, type Lever, type Spread, type WhatIf } from '@budget/core'
import { formatCents, formatMinutes, formatShortMonth, formatWeeks, formatWholeDollars } from '../format.js'
import { cn } from '../lib/cn.js'
import { useCategoryName } from '../app-data.js'
import type { CoreGoal } from '../coach/goals.js'
import type { GoalOutlook } from '../coach/outlook.js'

/**
 * What if… (F35): the goal chosen, the main goal first, and chips of the
 * levers of F34, each worked out by core's whatIf on the phone from what is
 * already loaded, so a tap reads and asks nothing. Hours only for a goal
 * with a cost an hour (G1).
 */
export function WhatIfPanel({ goals, outlooks, end, month, asOf }: { goals: readonly CoreGoal[]; outlooks: ReadonlyMap<string, GoalOutlook>; end: Spread | null; month: string; asOf: string }) {
  const nameOf = useCategoryName()
  const [chosen, setChosen] = useState<string | null>(null)
  const goal = goals.find((g) => g.id === chosen) ?? goals[0]
  const outlook = goal === undefined ? undefined : outlooks.get(goal.id)
  return (
    <>
      <h3 className="border-t pt-4 font-semibold">What if…</h3>
      {goals.length > 1 && goal !== undefined ? (
        <label className="block space-y-1">
          <span className="text-muted-foreground">For the goal</span>
          <select
            value={goal.id}
            onChange={(e) => setChosen(e.target.value)}
            className="block min-h-11 w-full rounded-md border bg-background px-3 text-base"
          >
            {goals.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {goal === undefined || outlook === undefined ? null : (
        <WhatIfChips key={goal.id} goal={goal} outlook={outlook} end={end} month={month} names={nameOf} asOf={asOf} />
      )}
    </>
  )
}

const KINDS = ['quarter', 'tenth', 'best_month'] as const

/** The levers of the two categories with the largest, each's quarter, tenth and best month. */
function chipsOf(levers: readonly Lever[]): readonly Lever[] {
  const categories = [...new Set(levers.map((l) => l.categoryId))].slice(0, 2)
  return categories.flatMap((id) => KINDS.flatMap((kind) => levers.filter((l) => l.categoryId === id && l.kind === kind)))
}

function WhatIfChips(props: { goal: CoreGoal; outlook: GoalOutlook; end: Spread | null; month: string; names: (id: string) => string; asOf: string }) {
  const { goal, outlook, end, names } = props
  const chips = chipsOf(outlook.levers.levers)
  const [picked, setPicked] = useState<number | null>(null)
  const lever = picked === null ? undefined : chips[picked]
  const result = useMemo(
    () =>
      lever === undefined
        ? null
        : whatIf({ asOf: isoDate(props.asOf), monthlyCents: lever.monthlyCents, end, goal: { remainingCents: outlook.forecast.remainingCents, pace: outlook.forecast.pace, unitCostCents: goal.unitCostCents } }),
    [lever, end, outlook, goal, props.asOf],
  )
  if (chips.length === 0) {
    return <p className="text-muted-foreground">{outlook.forecast.pace.status === 'met' ? 'This goal’s target is met.' : 'What-ifs need a whole month of your spending first.'}</p>
  }
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="What if you trimmed">
        {chips.map((l, i) => (
          <button
            key={`${l.categoryId} ${l.kind}`}
            type="button"
            aria-pressed={picked === i}
            onClick={() => setPicked(picked === i ? null : i)}
            className={cn('min-h-11 rounded-full border px-4 text-sm font-medium', picked === i ? 'border-primary bg-primary text-primary-foreground' : 'bg-background')}
          >
            {`${names(l.categoryId)} ${l.kind === 'quarter' ? '−25%' : l.kind === 'tenth' ? '−10%' : 'to your best month'}`}
          </button>
        ))}
      </div>
      {/* The answer on the accent's soft fill, as Mockup A sets it; its muted words take canvas-muted there (ADR 0010). */}
      <div aria-live="polite" className={cn('space-y-1', lever !== undefined && result !== null && 'rounded-lg bg-primary-soft px-4 py-3 [--muted-foreground:var(--canvas-muted)]')}>
        {lever === undefined || result === null ? (
          <p className="text-muted-foreground">Tap one to see what it changes.</p>
        ) : (
          <WhatIfResult lever={lever} result={result} goal={goal} name={names(lever.categoryId)} month={props.month} />
        )}
      </div>
    </>
  )
}

function WhatIfResult({ lever, result, goal, name, month }: { lever: Lever; result: WhatIf; goal: CoreGoal; name: string; month: string }) {
  const { goal: date, end } = result
  return (
    <>
      <p>
        Trim {name} by <span className="tnum font-medium">{formatCents(lever.monthlyCents)}</span> a month (
        <span className="tnum">{formatCents(result.weeklyCents)}</span> a week).
      </p>
      <p>
        <span className="font-medium">{goal.name}: </span>
        {date.status === 'met'
          ? 'already there.'
          : date.status === 'alone'
            ? `this alone gets you there in ${formatWeeks(date.weeks)}, about ${formatShortMonth(date.date)}.`
            : date.dates.late === null
              ? `${formatShortMonth(date.dates.early)} or later, ${formatWeeks(date.weeksSooner)} sooner.`
              : date.rough || formatShortMonth(date.dates.early) === formatShortMonth(date.dates.late)
                ? `about ${formatShortMonth(date.dates.middle)}, ${formatWeeks(date.weeksSooner)} sooner.`
                : `${formatShortMonth(date.dates.early)} – ${formatShortMonth(date.dates.late)}, ${formatWeeks(date.weeksSooner)} sooner.`}
      </p>
      {result.minutesPerMonth === null ? null : (
        <p className="text-muted-foreground">
          That’s {formatMinutes(result.minutesPerMonth)} of {goal.unitLabel ?? 'your goal'} a month.
        </p>
      )}
      {end === null ? null : (
        <p className="text-muted-foreground">
          {`End of ${month}: `}
          <span className="tnum">{end.low === end.high ? `about ${formatWholeDollars(end.mid)}` : `${formatWholeDollars(end.low)} to ${formatWholeDollars(end.high)}`}</span>
          {` with ${formatCents(result.keptThisMonthCents)} kept this month.`}
        </p>
      )}
    </>
  )
}
