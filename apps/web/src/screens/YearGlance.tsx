import type { ReactNode } from 'react'
import type { Change, PeriodComparison, YearSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import { navigate } from '../nav.js'
import { formatBasisPoints, formatCents, formatChange, formatIsoDate, formatMonthName, formatMonthTitle, formatShare } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { useFunds } from '../funds.js'
import { useDebts } from '../debts.js'
import { CompareLine } from './CompareLine.js'
import { DebtsChart, SavingsGoalsChart, TopRing, YearPie } from './YearCharts.js'
import { LINE_BUTTON } from '../components/ui/link.js'

/**
 * The workbook's Home, as the top of the Year (plan §2, §6.4), in Mockup A's
 * cards: four across from 1280px, two from 640px, each number core's
 * (yearSheet, F12, F18).
 *
 * Home's cards read today's calendar year; these read the Year shown, so
 * they agree with the tables below them. "Left over" is income less
 * expenses less savings (decision 15), never called "Left to spend", which
 * on the Month is what is left of a budget. Balances need the start month's
 * balance typed on the Month (D17), and say so until it is.
 */
export function YearGlance({
  sheet,
  wide,
  comparison = null,
}: {
  sheet: YearSheet
  wide: boolean
  /** The same days a year earlier (D26); null while it loads. */
  comparison?: PeriodComparison | 'failed' | null
}) {
  const { displayName } = useAppData()
  const { atAGlance, startingBalanceCents: start, endingBalanceCents: end } = sheet
  const startMonth = formatMonthName(sheet.startMonth)
  const best = atAGlance.bestSavingsMonth
  const funds = useFunds()
  const debts = useDebts()
  return (
    <section aria-label="Year at a glance" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-4">
      {/* Home!C4, the name typed on START HERE with the workbook's "!": the
        one wide card, white to the accent's tint as the Month's hero. */}
      <Card tint className="sm:col-span-2 xl:col-span-4">
        <h2 className="text-2xl font-semibold">{displayName === '' ? 'Hi!' : `Hi, ${displayName}!`}</h2>
        {displayName === '' ? (
          <button type="button" className={cn('mt-1 text-sm underline underline-offset-4', LINE_BUTTON)} onClick={() => navigate('setup')}>
            Add your name in Setup
          </button>
        ) : null}
      </Card>
      {/* Home's "Annual Totals" card (G9:H18): its pie, whose legend names
        the three totals with their shares. */}
      <Card>
        <h3 className={cn(TITLE, 'mb-3')}>Annual totals</h3>
        <YearPie sheet={sheet} palette="home" />
      </Card>
      <VsLastYear comparison={comparison} />
      {/* On a desktop these are Annual's left panel, beside the tables. */}
      {wide ? null : (
        <Card>
          {/* The grid is the list itself: a <div> of pairs inside the <dl>
            was one level too deep for a screen reader to pair them (FE-11). */}
          <dl className="grid grid-cols-2 gap-2">
            <Amount label="Left over" cents={sheet.leftOverCents} hint="Income, less expenses and savings" className="col-span-2" />
            <Amount label="Starting balance" cents={start} />
            <Amount label="Ending balance" cents={end} />
          </dl>
          {start === null ? (
            <button
              type="button"
              className={cn('mt-2 text-left text-xs underline underline-offset-4', LINE_BUTTON)}
              onClick={() => navigate('month', sheet.startMonth.slice(0, 7))}
            >
              Type {startMonth}&rsquo;s starting balance on the Month to see these
            </button>
          ) : null}
        </Card>
      )}
      <Card>
        <h3 className={cn(TITLE, 'mb-1')}>Biggest expense</h3>
        {atAGlance.biggest === null ? (
          <p className="mt-1 text-sm">Nothing spent yet</p>
        ) : (
          <p>
            <span className="block break-words font-semibold [overflow-wrap:anywhere]">{atAGlance.biggest.name}</span>
            <Figure className="text-xl font-bold">{formatCents(atAGlance.biggest.amountCents)}</Figure>
          </p>
        )}
        <h3 className={cn(TITLE, 'mt-4 mb-1')}>Best savings month</h3>
        <p>
          <span className="block font-semibold">{formatMonthTitle(best.month)}</span>
          <Figure className="text-xl font-bold">{formatCents(best.savedCents)}</Figure>
          {best.goalCents > 0 ? <span className="tnum text-[0.8125rem] text-muted-foreground"> of {formatCents(best.goalCents)}</span> : null}
        </p>
      </Card>
      <Card className="sm:col-span-2 xl:col-span-1">
        <h3 className={cn(TITLE, 'mb-3')}>Top 3 expenses</h3>
        {atAGlance.top3.length === 0 ? (
          <p className="mt-1 text-sm">Nothing spent yet</p>
        ) : (
          <ol className="space-y-3 text-sm">
            {atAGlance.top3.map((t, i) => (
              // The figure drops under the name when both do not fit, as
              // with the phone's text at 200%, rather than run off (N58).
              <li key={t.categoryId} className="flex flex-wrap items-center gap-x-2">
                <TopRing top={t} rank={i} />
                <span className="min-w-0 flex-1 basis-20 break-words font-medium [overflow-wrap:anywhere]">{t.name}</span>
                <span className="tnum ml-auto shrink-0 text-right text-muted-foreground">
                  {formatCents(t.amountCents)} · {formatShare(t.shareBp)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {/* Home's "Savings Goals" card (O3:P11): each fund today, whichever year is shown. */}
      <Card className="sm:col-span-2">
        <h3 className={cn(TITLE, 'mb-3')}>Savings goals today</h3>
        {funds.status === 'loading' ? <p className="text-sm">Loading…</p> : null}
        {funds.status === 'failed' ? <p className="text-sm">{funds.message}</p> : null}
        {funds.status === 'ready' ? (
          funds.funds.funds.some((f) => f.figures !== null) ? (
            <SavingsGoalsChart funds={funds.funds.funds} />
          ) : (
            <button type="button" className={cn('text-left text-sm underline underline-offset-4', LINE_BUTTON)} onClick={() => navigate('savings')}>
              Set a goal for a savings fund to see it here
            </button>
          )
        ) : null}
      </Card>
      {/* Home's debt chart (J12:M23, chart4): each debt today, whichever year is shown. */}
      <Card className="sm:col-span-2">
        <h3 className={cn(TITLE, 'mb-3')}>Debts today</h3>
        {debts.status === 'loading' ? <p className="text-sm">Loading…</p> : null}
        {debts.status === 'failed' ? <p className="text-sm">{debts.message}</p> : null}
        {debts.status === 'ready' ? (
          debts.debts.status === null ? (
            <button type="button" className={cn('text-left text-sm underline underline-offset-4', LINE_BUTTON)} onClick={() => navigate('debts')}>
              {debts.debts.rows.length === 0
                ? 'Add your debts to see them here'
                : 'None of your debts is ever paid off at its minimum. Open Debts to see why'}
            </button>
          ) : (
            <DebtsChart status={debts.debts.status} />
          )
        ) : null}
      </Card>
    </section>
  )
}

/**
 * Mockup A's card: white, or the accent's tint for the one hero, a 1px edge, 16px
 * corners, no shadow, 20px by 22px inside from 768px.
 */
function Card({ tint = false, className, children }: { tint?: boolean; className?: string; children: ReactNode }) {
  const fill = tint ? 'bg-linear-to-r from-card to-primary-tint' : 'bg-card'
  return <div className={cn('min-w-0 rounded-xl border p-4 md:px-[1.375rem] md:py-5', fill, className)}>{children}</div>
}

/** A card's name: Mockup A's 15px muted label. */
const TITLE = 'text-[0.9375rem] font-medium text-muted-foreground'

/** One label and its amount; a balance with no start typed has none (D17). */
function Amount({
  label,
  cents,
  hint = null,
  className,
}: {
  label: string
  cents: number | null
  hint?: string | null
  className?: string
}) {
  return (
    <div className={className}>
      <dt className="text-[0.8125rem] text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold">
        {cents === null ? <span className="text-sm font-medium">Not yet</span> : <Figure>{formatCents(cents)}</Figure>}
      </dd>
      {hint === null ? null : <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/**
 * "vs last year" (D26, F25): Income, Spent and Saved over the Year's days so
 * far against the same days a year earlier, every figure periodComparison's.
 * They are the comparison's own figures, named with their dates, never set
 * under the Year's totals, which count this month's planned bills whole
 * (F10). Only inside the records (F24): otherwise the card says what to
 * import, and when the year before could not be read, says so in one line.
 */
function VsLastYear({ comparison }: { comparison: PeriodComparison | 'failed' | null }) {
  if (comparison === null || (comparison !== 'failed' && comparison.status === 'not_started')) return null
  const range = (w: { from: string; to: string }) => `${formatIsoDate(w.from)} – ${formatIsoDate(w.to)}`
  return (
    <Card>
      <h3 className={cn(TITLE, 'mb-2')}>vs last year</h3>
      {comparison === 'failed' || comparison.status === 'before_records' ? (
        <CompareLine comparison={comparison} label="Compared with last year" earlier="last year" day={formatIsoDate} />
      ) : (
        <div role="group" aria-label="Compared with last year" className="mt-1 text-sm">
          <p>
            <span className="inline-block">{range(comparison.now)}</span>{' '}
            <span className="inline-block">against {range(comparison.before)}</span>
          </p>
          <dl className="mt-2 space-y-1.5">
            <Versus label="Income" change={comparison.summary.income} />
            <Versus label="Spent" change={comparison.summary.spent} />
            <Versus label="Saved" change={comparison.summary.saved} />
          </dl>
        </div>
      )}
    </Card>
  )
}

/** One figure now, then, and the change in words. */
function Versus({ label, change }: { label: string; change: Change }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <dt className="font-medium">{label}</dt>
      <dd className="tnum text-right">
        <span className="font-semibold">{formatCents(change.nowCents)}</span> · was {formatCents(change.beforeCents)} ·{' '}
        {change.direction === 'same'
          ? 'about the same'
          : `${formatChange(change)}${change.changeBp === null ? '' : ` (${formatBasisPoints(Math.abs(change.changeBp))})`}`}
      </dd>
    </div>
  )
}
