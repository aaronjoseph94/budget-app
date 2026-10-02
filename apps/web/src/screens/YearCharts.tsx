import { useMemo, type ReactNode } from 'react'
import { goalBars, partShares, stackedColumns, type DebtStatus, type SavingsFund, type TopExpense, type YearGroups, type YearSheet } from '@budget/core'
import { debtBars, goalActualColumns, incomeExpenseColumns, savingsGoalBars, shareRing, yearPie } from '@budget/chart-specs'
import { formatCents, formatShare, formatShortMonth } from '../format.js'
import { SvgChart, fitted, said, useChartId, type Fitted } from '../components/ui/chart.js'
import { cn } from '../lib/cn.js'

/**
 * The Year's charts (plan §6.4, S14b), drawn by chart-specs from what core
 * computed: every slice, ring and column length is basis points from
 * `partShares`, `stackedColumns`, `goalBars` or F18's `shareBp` (F19). This
 * file only formats the amounts written beside them.
 */

/** The Year's income, expenses and savings as a pie (Home's chart3), in Mockup A's colours. */
export function YearPie({ sheet }: { sheet: YearSheet }) {
  const id = useChartId()
  const svg = useMemo((): Fitted => {
    const named: readonly [string, number][] = [
      ['Income', sheet.totals.income.actualCents],
      ['Expenses', sheet.totals.expenses.actualCents],
      ['Savings', sheet.totals.savings.actualCents],
    ]
    const shares = partShares({ parts: named.map(([key, cents]) => ({ key, cents })) }).parts
    const slices = named.map(([label, cents], i) => {
      const shareBp = shares[i]!.shareBp
      return {
        label,
        shareBp,
        valueText: shareBp === null ? formatCents(cents) : `${formatCents(cents)} · ${formatShare(shareBp)}`,
      }
    })
    return fitted(yearPie, {
      id,
      title: 'Income, expenses and savings',
      description: said(slices.map((s) => `${s.label}: ${s.valueText}`)),
      slices,
    })
  }, [id, sheet])
  return <SvgChart svg={svg} className="mx-auto max-w-xs" />
}

/** Home's chart9–11: one of the top 3 as its share of a ring. */
export function TopRing({ top, rank }: { top: TopExpense; rank: number }) {
  const id = useChartId()
  const svg = useMemo(
    () =>
      shareRing({
        id,
        title: top.name,
        description: `${top.name}: ${formatShare(top.shareBp)} of the year's spending.`,
        shareBp: top.shareBp,
        rank,
        centreText: formatShare(top.shareBp),
      }),
    [id, top, rank],
  )
  // Sized by a box of its own: SvgChart is always full width, and a second
  // width class beside its own would lose or win by stylesheet order (cn).
  return (
    <div className="w-14 shrink-0">
      <SvgChart svg={svg} />
    </div>
  )
}

/**
 * Home's savings-goals chart (chart5, D23): each fund with a goal, its
 * balance today over a track as long as the goal, the bar's length core's
 * `fundProgress`. Funds with no goal are left out, as the workbook's empty slots
 * draw nothing.
 */
export function SavingsGoalsChart({ funds }: { funds: readonly SavingsFund[] }) {
  const id = useChartId()
  const svg = useMemo(() => {
    const bars = funds.flatMap((f) => {
      const g = f.figures
      if (g === null) return []
      const valueText = `${formatCents(g.balanceCents)} of ${formatCents(g.goalCents)}`
      return [{ label: f.name, valueText, goalBp: 10_000, actualBp: g.progressBp === 0 ? null : g.progressBp }]
    })
    if (bars.length === 0) return null
    return fitted(savingsGoalBars, {
      id,
      title: 'Savings goals',
      description: said(bars.map((b) => `${b.label}: ${b.valueText}`)),
      bars,
    })
  }, [id, funds])
  return svg === null ? null : <SvgChart svg={svg} className="max-w-md" />
}

/**
 * Home's debt chart (chart4, D25): each debt's balance today over a track
 * as long as its starting balance, every debt on one scale, the largest
 * starting balance, as chart4's columns share one axis; core's `goalBars`
 * gives the lengths, the starting balance standing where a goal does.
 */
export function DebtsChart({ status }: { status: DebtStatus }) {
  const id = useChartId()
  const svg = useMemo(() => {
    const lengths = goalBars({
      rows: status.debts.map((d) => ({ categoryId: d.name, budgetCents: d.startingBalanceCents, actualCents: d.balanceCents })),
    }).bars
    const bars = status.debts.map((d, i) => ({
      label: d.name,
      valueText: `${formatCents(d.balanceCents)} left of ${formatCents(d.startingBalanceCents)}`,
      goalBp: lengths[i]!.goalBp,
      actualBp: lengths[i]!.actualBp === 0 ? null : lengths[i]!.actualBp,
    }))
    return fitted(debtBars, { id, title: 'Debts', description: said(bars.map((b) => `${b.label}: ${b.valueText}`)), bars })
  }, [id, status])
  return <SvgChart svg={svg} className="max-w-md" />
}

/** chart42's six, in its order (Hidden!I32:I37), short enough to sit under a pair of columns. */
const TOTALS: readonly [keyof YearGroups, string, string][] = [
  ['income', 'Income', 'Income'],
  ['savings', 'Savings', 'Savings'],
  ['variable', 'Variable', 'Variable expenses'],
  ['bill', 'Bills', 'Bills'],
  ['debt', 'Debts', 'Debts'],
  ['subscription', 'Subs.', 'Subscriptions'],
]

/**
 * Annual's chart row (row 23): income and expenses by month (chart40), and
 * each list's Goal against its Actual over the Year (chart42). Annual's pie
 * (chart41) is the glance row's pie, drawn once (V12).
 */
export function AnnualCharts({ sheet, wide, className }: { sheet: YearSheet; wide: boolean; className?: string }) {
  const id = useChartId()
  const drawn = useMemo(() => {
    const stacked = stackedColumns({
      columns: sheet.months.map((m) => ({ key: m.month, parts: [m.income.actualCents, m.expenses.actualCents] })),
    }).columns
    const columns = fitted(incomeExpenseColumns, {
      id: `${id}-months`,
      title: 'Income and expenses by month',
      description: said(
        sheet.months.map(
          (m) =>
            `${formatShortMonth(m.month)}: income ${formatCents(m.income.actualCents)}, expenses ${formatCents(m.expenses.actualCents)}`,
        ),
      ),
      columns: sheet.months.map((m, i) => ({
        label: formatShortMonth(m.month).slice(0, 3),
        valueText: `income ${formatCents(m.income.actualCents)}, expenses ${formatCents(m.expenses.actualCents)}`,
        parts: [stacked[i]!.parts[0] ?? null, stacked[i]!.parts[1] ?? null] as const,
      })),
    })
    const bars = goalBars({
      rows: TOTALS.map(([key]) => ({
        categoryId: key,
        budgetCents: sheet.totals[key].budgetCents,
        actualCents: sheet.totals[key].actualCents,
      })),
    }).bars
    const text = (key: keyof YearGroups) =>
      `${formatCents(sheet.totals[key].actualCents)} of ${formatCents(sheet.totals[key].budgetCents)}`
    const totals = fitted(goalActualColumns, {
      id: `${id}-totals`,
      title: 'Goals and budgets against actuals',
      description: said(TOTALS.map(([key, , name]) => `${name}: ${text(key)}`)),
      groups: TOTALS.map(([key, label], i) => ({
        label,
        valueText: text(key),
        goalBp: bars[i]!.goalBp,
        actualBp: bars[i]!.actualBp,
      })),
    })
    return { columns, totals }
  }, [id, sheet])

  return (
    <section
      aria-label="Year charts"
      className={cn('grid min-w-0 gap-6 rounded-xl border bg-card p-4 md:px-6 md:py-[1.375rem]', wide ? 'grid-cols-4' : 'grid-cols-1', className)}
    >
      {/* Two across on a desktop. Annual's own pie (chart41) is left out:
        the glance row above already draws the Year's totals as a pie, and
        the page showed it twice (V12). Each chart's words are 13 px
        whatever its width (SvgChart); the cap keeps its bars from
        stretching across the card. */}
      <Chart title="Income and expenses by month" className={cn(wide && 'col-span-2')}>
        <SvgChart svg={drawn.columns} className="max-w-md" />
      </Chart>
      <Chart title="Against goals and budgets" className={cn(wide && 'col-span-2')}>
        <SvgChart svg={drawn.totals} className="max-w-md" />
      </Chart>
    </section>
  )
}

function Chart({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Mockup A's card title: 18px, in the ink. */}
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  )
}
