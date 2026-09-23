import type { ReactNode } from 'react'
import type { YearSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import { navigate } from '../nav.js'
import { formatCents, formatMonthTitle, formatShare } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'

/**
 * Workbook's Home, as the top of the Year (plan §2, §6.4): white cards on
 * Home's blue-grey canvas, each number core's (yearSheet, F12, F18).
 *
 * Home's cards read today's calendar year; these read the Year shown, so
 * they agree with the tables below them. "Left over" is income less
 * expenses less savings (decision 15), never called "Left to spend", which
 * on the Month is what is left of a budget. Balances need the start month's
 * balance typed on the Month (D17), and say so until it is.
 */
export function YearGlance({ sheet, className }: { sheet: YearSheet; className?: string }) {
  const { displayName } = useAppData()
  const { totals, atAGlance, startingBalanceCents: start, endingBalanceCents: end } = sheet
  const startMonth = formatMonthTitle(sheet.startMonth).split(' ')[0]
  const best = atAGlance.bestSavingsMonth
  return (
    <section aria-label="Year at a glance" className={cn('-mx-4 grid gap-3 bg-home-canvas p-4 sm:grid-cols-2 md:mx-0 md:rounded-xl lg:grid-cols-4', className)}>
      {/* Home!C4, the name typed on START HERE with Workbook's "!". */}
      <Card className="sm:col-span-2 lg:col-span-4">
        <h2 className="text-2xl text-home-ink">{displayName === '' ? 'Hi!' : `Hi, ${displayName}!`}</h2>
        {displayName === '' ? (
          <button type="button" className="mt-1 text-sm underline underline-offset-4" onClick={() => navigate('setup')}>
            Add your name in Setup
          </button>
        ) : null}
      </Card>
      <Card>
        <dl className="grid grid-cols-3 gap-2 sm:grid-cols-1">
          <Amount label="Income" cents={totals.income.actualCents} />
          <Amount label="Expenses" cents={totals.expenses.actualCents} />
          <Amount label="Savings" cents={totals.savings.actualCents} />
        </dl>
      </Card>
      <Card>
        <dl className="space-y-2">
          <Amount label="Left over" cents={sheet.leftOverCents} hint="Income, less expenses and savings" />
          <div className="grid grid-cols-2 gap-2">
            <Amount label="Starting balance" cents={start} />
            <Amount label="Ending balance" cents={end} />
          </div>
        </dl>
        {start === null ? (
          <button
            type="button"
            className="mt-2 text-left text-xs underline underline-offset-4"
            onClick={() => navigate('month', sheet.startMonth.slice(0, 7))}
          >
            Type {startMonth}&rsquo;s starting balance on the Month to see these
          </button>
        ) : null}
      </Card>
      <Card>
        <h3 className="text-xs font-medium text-muted-foreground">Biggest expense</h3>
        {atAGlance.biggest === null ? (
          <p className="mt-1 text-sm">Nothing spent yet</p>
        ) : (
          <p className="mt-1">
            <span className="block break-words font-medium [overflow-wrap:anywhere]">{atAGlance.biggest.name}</span>
            <Figure className="text-lg">{formatCents(atAGlance.biggest.amountCents)}</Figure>
          </p>
        )}
        <h3 className="mt-3 text-xs font-medium text-muted-foreground">Best savings month</h3>
        <p className="mt-1">
          <span className="block font-medium">{formatMonthTitle(best.month)}</span>
          <Figure className="text-lg">{formatCents(best.savedCents)}</Figure>
          {best.goalCents > 0 ? <span className="tnum text-xs"> of {formatCents(best.goalCents)}</span> : null}
        </p>
      </Card>
      <Card>
        <h3 className="text-xs font-medium text-muted-foreground">Top 3 expenses</h3>
        {atAGlance.top3.length === 0 ? (
          <p className="mt-1 text-sm">Nothing spent yet</p>
        ) : (
          <ol className="mt-1 space-y-1.5 text-sm">
            {atAGlance.top3.map((t) => (
              <li key={t.categoryId} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{t.name}</span>
                <span className="tnum shrink-0 text-right">
                  {formatCents(t.amountCents)} · {formatShare(t.shareBp)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </section>
  )
}

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('rounded-xl bg-home-card p-4 text-home-ink shadow-sm', className)}>{children}</div>
}

/** One label and its amount; a balance with no start typed has none (D17). */
function Amount({ label, cents, hint = null }: { label: string; cents: number | null; hint?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-lg font-bold">
        {cents === null ? <span className="text-sm font-medium">Not yet</span> : <Figure>{formatCents(cents)}</Figure>}
      </dd>
      {hint === null ? null : <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}
