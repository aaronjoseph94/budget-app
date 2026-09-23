import type { ReactNode } from 'react'
import type { PeriodRow, WeekSheet } from '@budget/core'
import { formatCents, formatIsoDate, formatMagnitude } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { Block, type EditorDone } from './MonthScreen.js'
import { WeekBudgetEditor } from './WeekBudgetEditor.js'

/**
 * Workbook's Weekly Budget laid out as the Month lays out a month tab (plan
 * §6.2, §6.3): the summary, the six blocks, and the card-payment footnote,
 * every number weekSheet's. `aside` stands where the Month has its charts,
 * as Weekly Budget's own chart well (I3:M18) stands beside its summary.
 *
 * A row opens nothing here: the Month's charges sheet names its month, and
 * the Week has no sheet of its own yet. A budget is typed in its row, and
 * is the weekly one, the same every week.
 */
export function WeekBlocks({
  sheet,
  aside,
  onUnsaved,
}: {
  sheet: WeekSheet
  aside: ReactNode
  /** A budget refused after its editor closed, or null as another opens. */
  onUnsaved: (message: string | null) => void
}) {
  const blockProps = {
    onEditStart: () => onUnsaved(null),
    editor: (row: PeriodRow, word: 'Budget' | 'Goal', done: EditorDone) => (
      <WeekBudgetEditor row={row} word={word} onCancel={done.cancel} onSaved={done.saved} onFailedAfterClose={onUnsaved} />
    ),
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {sheet.importedThrough === null
          ? 'No statement imported yet.'
          : `Statement imported up to ${formatIsoDate(sheet.importedThrough)}`}
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WeekSummary sheet={sheet} />
        {aside}
        <Block kind="variable" block={sheet.blocks.variable} {...blockProps} className="order-1 xl:order-7" />
        <Block kind="bill" block={sheet.blocks.bill} {...blockProps} className="order-2 xl:order-4" />
        <Block kind="subscription" block={sheet.blocks.subscription} {...blockProps} className="order-3 xl:order-6" />
        <Block kind="debt" block={sheet.blocks.debt} {...blockProps} className="order-4 xl:order-5" />
        <Block kind="income" block={sheet.blocks.income} {...blockProps} className="order-5 xl:order-2" />
        <Block kind="savings" block={sheet.blocks.savings} {...blockProps} className="order-6 xl:order-3" />
      </div>
      {/* Left out of every block and total above, so said out loud (D9). */}
      {sheet.transfersCents !== 0 ? (
        <p className="text-sm text-muted-foreground">
          {sheet.transfersCents > 0 ? 'Paid to your card: ' : 'Moved out, not spending: '}
          <span className="tnum">{formatMagnitude(sheet.transfersCents)}</span> — not counted.
          {sheet.transfersCents > 0 ? ' What it paid for is already in the blocks above.' : ''}
        </p>
      ) : null}
    </>
  )
}

/**
 * Weekly Budget's summary panel (B8:G16): Money Spent and Left to Spend
 * (D11, D13), both core's. Its Starting and Ending Balance (D9, D15) are
 * not shown: no balance is typed for a week, and core gives no ending
 * balance without a start (D17). A negative Left to spend takes the
 * Month's pink, as Workbook's D13:F14 format marks it.
 */
function WeekSummary({ sheet }: { sheet: WeekSheet }) {
  const { spentCents, leftToSpendCents: left } = sheet.summary
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  return (
    <section aria-label="Summary" className="order-0 rounded-xl border bg-summary p-4 shadow-sm xl:order-1">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-1">
        <div>
          <dt className="text-xs font-medium text-summary-label">Spent</dt>
          <dd className="text-2xl font-bold text-summary-value">
            <Figure>{formatCents(spentCents)}</Figure>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-summary-label">Left to spend</dt>
          <dd className="text-2xl font-bold text-summary-value">
            <Figure className={cn(left < 0 && '-mx-1.5 rounded-lg bg-summary-negative px-1.5 text-summary-negative-ink')}>
              {formatCents(left)}
            </Figure>
          </dd>
          {/* Workbook takes a blank budget as $0 (F5), and only Variable expenses count. */}
          {noBudgets ? (
            <dd className="mt-0.5 text-xs text-summary-label">No weekly budgets on Variable expenses yet.</dd>
          ) : null}
        </div>
      </dl>
    </section>
  )
}
