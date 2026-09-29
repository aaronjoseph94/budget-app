import type { ReactNode } from 'react'
import type { PeriodComparison, PeriodRow, WeekSheet } from '@budget/core'
import { formatCents } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { ImportedThrough, PeriodBlocks, TransfersNote, type EditorDone } from './MonthScreen.js'
import { WeekBudgetEditor } from './WeekBudgetEditor.js'
import { NOT_SPENDING } from './MonthCharges.js'
import { CompareLine } from './CompareLine.js'
import { StatCard } from './MonthSummary.js'

/**
 * The workbook's Weekly Budget laid out as Mockup A's Period screen: Spent and
 * Left to spend as stat cards with `aside`, the goal, beside them as a wide
 * card, where Weekly Budget's own chart well (I3:M18) stands beside its
 * summary; then the six blocks two across in list order, as the Month lays
 * them, and the card-payment footnote. Every number is weekSheet's.
 *
 * A row opens its charges for the week, in the Month's sheet named with the
 * week's dates (N46). A budget is typed in its row, and is the weekly one,
 * the same every week.
 */
export function WeekBlocks({
  sheet,
  comparison = null,
  aside,
  onUnsaved,
  onOpen,
}: {
  sheet: WeekSheet
  /** Last week beside this one (D26); null while it loads, or where none is shown. */
  comparison?: PeriodComparison | 'failed' | null
  aside: ReactNode
  /** A budget refused after its editor closed, or null as another opens. */
  onUnsaved: (message: string | null) => void
  /** Opens a row's charges; without it a row is not a button. */
  onOpen?: (categoryId: string) => void
}) {
  const blockProps = {
    onOpen,
    onEditStart: () => onUnsaved(null),
    editor: (row: PeriodRow, word: 'Budget' | 'Goal', done: EditorDone) => (
      <WeekBudgetEditor row={row} word={word} onCancel={done.cancel} onSaved={done.saved} onFailedAfterClose={onUnsaved} />
    ),
  }
  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <WeekSummary sheet={sheet} comparison={comparison} />
        {aside}
      </div>
      <ImportedThrough through={sheet.importedThrough} />
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:gap-5">
        <PeriodBlocks blocks={sheet.blocks} inListOrder {...blockProps} />
      </div>
      <TransfersNote cents={sheet.transfersCents} onOpen={onOpen === undefined ? undefined : () => onOpen(NOT_SPENDING)} />
    </>
  )
}

/**
 * Weekly Budget's summary panel (B8:G16): Money Spent and Left to Spend
 * (D11, D13), both core's. Its Starting and Ending Balance (D9, D15) are
 * not shown: no balance is typed for a week, and core gives no ending
 * balance without a start (D17). Mockup A draws the two as the Month's stat
 * cards, Left to spend the hero as on the Month, and a negative one takes
 * the Month's pink, as the workbook's D13:F14 format marks it. Under Spent,
 * last week to the same weekday (D26), as the mockup puts it.
 */
function WeekSummary({ sheet, comparison }: { sheet: WeekSheet; comparison: PeriodComparison | 'failed' | null }) {
  const { spentCents, leftToSpendCents: left } = sheet.summary
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  return (
    <section aria-label="Summary">
      <dl className="grid h-full grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:gap-4">
        <StatCard
          label="Spent"
          icon="bag"
          extra={<CompareLine comparison={comparison} label="Compared with last week" earlier="last week" />}
        >
          <Figure>{formatCents(spentCents)}</Figure>
        </StatCard>
        {/* The workbook takes a blank budget as $0 (F5), and only Variable expenses count. */}
        <StatCard label="Left to spend" icon="sparkles" hero hint={noBudgets ? 'No weekly budgets on Variable expenses yet.' : null}>
          <Figure className={cn(left < 0 && '-mx-1.5 rounded-lg bg-summary-negative px-1.5 text-summary-negative-ink')}>
            {formatCents(left)}
          </Figure>
        </StatCard>
      </dl>
    </section>
  )
}
