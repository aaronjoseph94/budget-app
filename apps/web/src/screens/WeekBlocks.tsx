import type { ReactNode } from 'react'
import type { PeriodComparison, PeriodRow, WeekSheet } from '@budget/core'
import { formatCents } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { ImportedThrough, PeriodBlocks, TransfersNote, type EditorDone } from './MonthScreen.js'
import { WeekBudgetEditor } from './WeekBudgetEditor.js'
import { CompareLine } from './CompareLine.js'

/**
 * The workbook's Weekly Budget laid out as the Month lays out a month tab (plan
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
  comparison = null,
  aside,
  onUnsaved,
}: {
  sheet: WeekSheet
  /** Last week beside this one (D26); null while it loads, or where none is shown. */
  comparison?: PeriodComparison | 'failed' | null
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
      <ImportedThrough through={sheet.importedThrough} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <WeekSummary sheet={sheet} comparison={comparison} />
        {aside}
        <PeriodBlocks blocks={sheet.blocks} {...blockProps} />
      </div>
      <TransfersNote cents={sheet.transfersCents} />
    </>
  )
}

/**
 * Weekly Budget's summary panel (B8:G16): Money Spent and Left to Spend
 * (D11, D13), both core's. Its Starting and Ending Balance (D9, D15) are
 * not shown: no balance is typed for a week, and core gives no ending
 * balance without a start (D17). A negative Left to spend takes the
 * Month's pink, as the workbook's D13:F14 format marks it. Under them, last
 * week to the same weekday (D26), as the Month's card ends with last month.
 */
function WeekSummary({ sheet, comparison }: { sheet: WeekSheet; comparison: PeriodComparison | 'failed' | null }) {
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
          {/* The workbook takes a blank budget as $0 (F5), and only Variable expenses count. */}
          {noBudgets ? (
            <dd className="mt-0.5 text-xs text-summary-label">No weekly budgets on Variable expenses yet.</dd>
          ) : null}
        </div>
      </dl>
      <div className="text-summary-value">
        <CompareLine comparison={comparison} label="Compared with last week" earlier="last week" />
      </div>
    </section>
  )
}
