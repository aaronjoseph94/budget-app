import { useMemo } from 'react'
import { goalBars, type PeriodRow, type PeriodSheet } from '@budget/core'
import { incomeBars, spendingDoughnut } from '@budget/chart-specs'
import { formatCents, formatShare } from '../format.js'
import { SvgChart, fitted, said, useChartId, type Fitted } from '../components/ui/chart.js'

/**
 * The workbook's chart panel, Jan!H3:K18: the income chart (chart12) and the
 * Variable-expenses doughnut (chart13), drawn by chart-specs from the month
 * core computed, in Mockup A's green and six hues. Every length and angle is core's basis points (`goalBars`,
 * `shareBp`, F17); this screen only formats the amounts written beside them.
 *
 * An income source shows once it has a goal or money in, as its row does in
 * the Income block. A Variable category whose refunds beat its spending has
 * no slice, since none can be drawn below zero, and is named under the ring.
 */
export function MonthCharts({ sheet, className }: { sheet: PeriodSheet; className: string }) {
  // Names the charts' titles for a screen reader.
  const id = useChartId()
  const income = sheet.blocks.income.rows.filter((r) => r.budgetCents !== null || r.basis !== 'none')
  const variable = sheet.blocks.variable.rows
  const refunded = variable.filter((r) => r.actualCents < 0)
  // Redrawn only when the month does: the rows above all come from `sheet`.
  const drawn = useMemo(() => draw(id, income, variable, refunded), [id, sheet])

  return (
    // Mockup A's right column: each chart a card of its own, side by side
    // on a tablet and stacked from 1280px, beside the lists.
    <section aria-label="Charts" className={className}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-1 xl:gap-5">
        <div className="space-y-4 rounded-xl border bg-card p-4 md:px-6 md:pt-5 md:pb-6">
          <h2 className="text-lg font-semibold">Income against goals</h2>
          {drawn.income === null ? (
            <p className="text-sm text-muted-foreground">No income or goals this month yet.</p>
          ) : (
            // Text scales with a chart, so neither grows past a phone's
            // width when the panel spans two columns on a tablet.
            <SvgChart svg={drawn.income} className="max-w-sm" />
          )}
        </div>
        <div className="space-y-4 rounded-xl border bg-card p-4 md:px-6 md:pt-5 md:pb-6">
          <h2 className="text-lg font-semibold">Variable expenses by category</h2>
          {drawn.spending === null ? (
            <p className="text-sm text-muted-foreground">Nothing spent on Variable expenses this month yet.</p>
          ) : (
            <SvgChart svg={drawn.spending} className="mx-auto max-w-sm" />
          )}
          {refunded.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Not in the ring, as refunds were more than spending:{' '}
              {refunded.map((r) => `${r.name} (${formatCents(r.actualCents)})`).join(', ')}.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function draw(
  id: string,
  income: readonly PeriodRow[],
  variable: readonly PeriodRow[],
  refunded: readonly PeriodRow[],
): { income: Fitted | null; spending: Fitted | null } {
  const named = new Map(income.map((r) => [r.categoryId, r]))
  const bars = goalBars({ rows: income }).bars.flatMap((b) => {
    const r = named.get(b.categoryId)
    if (r === undefined) return []
    const valueText =
      r.budgetCents === null
        ? formatCents(r.actualCents)
        : `${formatCents(r.actualCents)} of ${formatCents(r.budgetCents)}`
    return [{ label: r.name, valueText, goalBp: b.goalBp, actualBp: b.actualBp }]
  })
  // Colour by the row's place on its whole list, as chart13 colours by row,
  // so a category keeps its colour whichever others have spending.
  const shared = variable.flatMap((r, listIndex) => (r.shareBp === null ? [] : [{ r, listIndex, shareBp: r.shareBp }]))
  const slices = shared.map(({ r, listIndex, shareBp }) => ({
    label: r.name,
    valueText: `${formatCents(r.actualCents)} · ${formatShare(shareBp)}`,
    shareBp,
    listIndex,
  }))
  return {
    income:
      bars.length === 0
        ? null
        : fitted(incomeBars, {
            id: `${id}-income`,
            title: 'Income against goals',
            description: said(
              income.map((r) =>
                r.budgetCents === null
                  ? `${r.name}: ${formatCents(r.actualCents)}, no goal`
                  : `${r.name}: ${formatCents(r.actualCents)} of a ${formatCents(r.budgetCents)} goal`,
              ),
            ),
            bars,
          }),
    spending:
      slices.length === 0
        ? null
        : fitted(spendingDoughnut, {
            id: `${id}-spending`,
            title: 'Variable expenses by category',
            description: said([
              ...shared.map(
                ({ r, shareBp }) => `${r.name}: ${formatCents(r.actualCents)}, ${formatShare(shareBp)} of spending`,
              ),
              ...refunded.map((r) => `${r.name} is not drawn: refunds were more than spending`),
            ]),
            slices,
          }),
  }
}
