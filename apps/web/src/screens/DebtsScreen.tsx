import { useId, useMemo, useState, type ReactNode } from 'react'
import { debtBalanceChange, endOfList, isoDate, type Change, type DebtBalanceChange, type DebtStanding, type DebtStatus } from '@budget/core'
import { debtRing } from '@budget/chart-specs'
import { useDebts } from '../debts.js'
import type { DebtRow } from '../ledger.js'
import { formatBasisPoints, formatCents, formatChange, formatMonthName, formatMonthTitle, formatRate } from '../format.js'
import { DebtEditor } from './DebtEditor.js'
import { DebtStrategies } from './DebtStrategies.js'
import { Alert, Loading } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { SvgChart } from '../components/ui/chart.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { HelpButton } from '../help/HelpButton.js'

/**
 * The workbook's Debt Calculator (S17): the summary card (Current Debt Total,
 * Debt-Free By, the month's payments, Payoff Progress; B8:F21) and a card
 * for each debt with its balance today and its paid-against-left doughnut
 * (H6:K21), in the Debts screen's order.
 *
 * Every figure is packages/core's: the schedule (debtPlan), where each debt
 * stands today (debtStatus, F22), each doughnut's basis points. Balances
 * come from the schedule alone, as the workbook's do (N53). Names are plain text.
 */
export function DebtsScreen() {
  const state = useDebts()
  // The debt being edited, by id; 'new' to add one.
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const ready = state.status === 'ready' ? state.debts : null
  const shown = editing === 'new' ? null : (ready?.rows.find((r) => r.id === editing) ?? null)
  // Each balance against a month ago (F25, D26), from the same schedule, so
  // there is no second read to fail; should core refuse it, only the lines go.
  const vs = useMemo((): DebtBalanceChange | null => {
    if (ready === null || ready.plan.amortization === null) return null
    try {
      return debtBalanceChange({ amortization: ready.plan.amortization, asOf: isoDate(ready.asOf) })
    } catch {
      return null
    }
  }, [ready])
  const add = () => {
    setNotice(null)
    setEditing('new')
  }
  // Mockup A: the Month's title row, Add a debt on its right from 640px; the
  // summary as one wide card, the debts three across from 1280px, the plans.
  return (
    <div className="space-y-4 xl:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>Debt payoff</MonthTitle>
            <HelpButton screen="debts" />
          </div>
          {/* Plan 3.3: the debts here are not the Month's Debts list. */}
          <p className="text-muted-foreground md:text-base">
            These are the loans and card balances you are paying down, to plan when each is paid off; they are separate
            from the Month&rsquo;s Debts list, which counts the payments you make each month.
          </p>
        </div>
        {state.status === 'ready' ? (
          <Button className="w-full sm:w-auto" onClick={add}>
            <Icon name="plus" /> Add a debt
          </Button>
        ) : null}
      </header>
      <p className="text-xs text-muted-foreground">
        A card you pay off from your bank can go here too, but give it no monthly amount on the Month&rsquo;s Debts
        list: what you bought on it is already counted there.
      </p>
      {state.status === 'loading' ? <Loading what="your debts" /> : null}
      {notice !== null ? <Alert tone={notice.ok ? 'success' : 'error'}>{notice.text}</Alert> : null}
      {state.status === 'failed' ? <Alert tone="error" title="Could not load your debts">{state.message}</Alert> : null}
      {state.status === 'ready' ? (
        <>
          {state.debts.plan.neverPaidOff.map((name) => (
            <Alert key={name} tone="error" title={`${name} is never paid off`}>
              Its minimum payment does not cover its interest, so its balance never goes down. Raise its minimum to plan it.
            </Alert>
          ))}
          {state.debts.status === null || state.debts.plan.amortization === null ? null : (
            <Summary
              status={state.debts.status}
              debtFree={state.debts.plan.amortization.debtFreeDate}
              leftOut={state.debts.plan.neverPaidOff}
              vs={vs}
            />
          )}
          {state.debts.rows.length === 0 ? (
            <p className="rounded-xl border bg-card p-4 text-sm">No debts yet. Add one to see when it is paid off.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
              {state.debts.rows.map((row) => (
                <li key={row.id}>
                  <DebtCard
                    row={row}
                    standing={state.debts.status?.debts.find((d) => d.name === row.name) ?? null}
                    vs={vs?.debts.find((d) => d.name === row.name)?.change ?? null}
                    monthAgo={vs?.monthAgo ?? null}
                    onEdit={() => setEditing(row.id)}
                  />
                </li>
              ))}
            </ul>
          )}
          {state.debts.strategies === null ? null : <DebtStrategies strategies={state.debts.strategies} />}
        </>
      ) : null}
      {ready !== null && editing !== null && (editing === 'new' || shown !== null) ? (
        <DebtEditor
          key={editing}
          row={shown}
          extras={shown === null ? [] : ready.extras.filter((e) => e.debt_id === shown.id)}
          sortOrder={endOfList({ sortOrders: ready.rows.map((r) => r.sort_order) }).sortOrder}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null)
            setNotice({ ok: true, text })
          }}
          onFailedAfterClose={(text) => setNotice({ ok: false, text })}
        />
      ) : null}
    </div>
  )
}

/**
 * B8:F21. "Debt-Free By" is B14's month, which no unpayable debt can have.
 * A debt that is never paid off has no schedule, so the totals leave it
 * out, and say so.
 */
function Summary({
  status,
  debtFree,
  leftOut,
  vs,
}: {
  status: DebtStatus
  debtFree: string
  leftOut: readonly string[]
  vs: DebtBalanceChange | null
}) {
  const t = status.totals
  return (
    // Below 360 px the ring goes under the figures, and the total has the
    // row to itself: beside the ring a five-figure total broke mid-number
    // (N67); below 640px beside the ring it did too, so it has its row there
    // as well. Mockup A's one wide card, tinted to the accent as each screen's
    // one hero is; two by two beside the ring until 1280px (design review
    // P2 item 13), four across from there. Muted words take canvas-muted
    // on the tint (ADR 0010).
    <section
      aria-label="Debt summary"
      className="grid grid-cols-1 items-center gap-4 rounded-xl border bg-linear-to-r from-card to-primary-tint p-4 min-[360px]:grid-cols-[1fr_auto] md:px-6 md:py-5 [--muted-foreground:var(--canvas-muted)]"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 xl:grid-cols-4">
        <Stat label="Current debt total" muted className="max-[359px]:col-span-2 max-sm:col-span-2">
          <Figure className="text-2xl font-bold md:text-[2rem] md:leading-tight">{formatCents(t.balanceCents)}</Figure>
        </Stat>
        <Stat label="Debt-free by" muted>
          <span className="text-lg font-semibold">{leftOut.length > 0 ? 'Not until every minimum covers its interest' : formatMonthTitle(debtFree)}</span>
        </Stat>
        <Stat label="Paid this month" muted>
          <span className="tnum text-lg font-semibold">{formatCents(t.paymentCents)}</span>
        </Stat>
        <Stat label="Payoff progress" muted>
          <span className="tnum text-lg font-semibold">{t.progressBp === null ? '—' : formatBasisPoints(t.progressBp)}</span>
          <span className="tnum block text-xs text-muted-foreground">
            {formatCents(t.paidCents)} of {formatCents(t.startingBalanceCents)}
          </span>
        </Stat>
      </dl>
      <Ring label="All debts" paidBp={t.progressBp ?? 10_000} className="w-24 max-[359px]:mx-auto" />
      {vs === null ? null : (
        <div role="group" aria-label="Compared with a month ago" className="border-t pt-3 text-sm min-[360px]:col-span-2">
          {/* The total now is Current debt total, above; this names the one it is set against. */}
          <p>
            End of {formatMonthName(vs.monthAgo)}: <span className="tnum font-semibold">{formatCents(vs.total.beforeCents)}</span>
          </p>
          <p className="mt-0.5 font-medium">
            <ChangeWords change={vs.total} />
          </p>
        </div>
      )}
      {leftOut.length > 0 ? (
        <p className="text-xs text-muted-foreground min-[360px]:col-span-2">Not in these totals, because they are never paid off: {leftOut.join(', ')}.</p>
      ) : null}
    </section>
  )
}

function DebtCard({
  row,
  standing,
  vs,
  monthAgo,
  onEdit,
}: {
  row: DebtRow
  standing: DebtStanding | null
  /** This debt's balance against a month ago; null for one never paid off. */
  vs: Change | null
  monthAgo: string | null
  onEdit: () => void
}) {
  return (
    // Each debt in Debts' rose, its tile and labels, as the Year draws these
    // debts (ADR 0010); its ring in the accent, as the summary's.
    <section aria-label={row.name} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-3 px-4 pt-4 md:px-5">
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-debts-tile text-debts-accent">
          <Icon name="card" className="size-[1.125rem]" />
        </span>
        <h2 className="min-w-0 break-words text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{row.name}</h2>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 md:px-5">
        <div>
          <p className="text-xs text-debts-ink">Balance today</p>
          {/* No standing is a debt never paid off: its balance is not worked out. */}
          <Figure className="text-2xl font-bold">{standing === null ? '—' : formatCents(standing.balanceCents)}</Figure>
          {standing === null ? <p className="text-xs text-muted-foreground">Not worked out, since it is never paid off</p> : null}
          {standing !== null && standing.month === null ? (
            <p className="text-xs text-muted-foreground">Starts {formatMonthTitle(row.start_date)}</p>
          ) : null}
          {vs === null || monthAgo === null ? null : (
            <p className="text-xs text-muted-foreground">
              {vs.direction === 'same' ? (
                `About the same as at the end of ${formatMonthName(monthAgo)}`
              ) : (
                <>
                  <ChangeWords change={vs} /> than at the end of {formatMonthName(monthAgo)}
                </>
              )}
            </p>
          )}
        </div>
        {standing === null ? null : <Ring label={row.name} paidBp={standing.progressBp ?? 10_000} className="w-20" />}
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pb-4 text-sm md:px-5">
        <Stat label="Starting balance">
          <span className="tnum">{formatCents(row.starting_balance_cents)}</span>
        </Stat>
        <Stat label="APR">
          <span className="tnum">{formatRate(row.apr_basis_points)}</span>
        </Stat>
        <Stat label="Minimum payment">
          <span className="tnum">{formatCents(row.minimum_payment_cents)}</span>
        </Stat>
        <Stat label="Paid off in">
          <span className="font-semibold">{standing === null ? 'Never' : formatMonthTitle(standing.paidOffIn)}</span>
        </Stat>
      </dl>
      <div className="px-4 pb-4 md:px-5">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </section>
  )
}

/** The Debt Calculator's doughnut, its lengths core's basis points (D25). */
function Ring({ label, paidBp, className }: { label: string; paidBp: number; className: string }) {
  const id = `debt${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const svg = useMemo(
    () =>
      debtRing({
        id,
        title: `${label}: paid and left`,
        description: `${formatBasisPoints(paidBp)} paid.`,
        paidBp,
        centreText: formatBasisPoints(paidBp),
      }),
    [id, label, paidBp],
  )
  return (
    <div className={className}>
      <SvgChart svg={svg} />
    </div>
  )
}

/** A label and its figure: the label in Debts' ink on a debt's card, `muted` on the summary. */
function Stat({ label, muted = false, className, children }: { label: string; muted?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <dt className={muted ? 'text-sm text-muted-foreground' : 'text-xs text-debts-ink'}>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** A change from core in words, with a marker the eye can find and a reader skips (F26). */
function ChangeWords({ change }: { change: Change }) {
  if (change.direction === 'same') return <>About the same</>
  return (
    <>
      <span aria-hidden="true">{change.direction === 'more' ? '▲ ' : '▼ '}</span>
      {formatChange(change)}
      {change.changeBp === null ? '' : ` (${formatBasisPoints(Math.abs(change.changeBp))})`}
    </>
  )
}
