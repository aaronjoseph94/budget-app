import { useId, useMemo, useState, type ReactNode } from 'react'
import { debtBalanceChange, endOfList, isoDate, type Change, type DebtBalanceChange, type DebtStanding, type DebtStatus } from '@budget/core'
import { debtRing } from '@budget/chart-specs'
import { useDebts } from '../debts.js'
import type { DebtRow } from '../ledger.js'
import { formatBasisPoints, formatCents, formatChange, formatMonthName, formatMonthTitle, formatRate } from '../format.js'
import { DebtEditor } from './DebtEditor.js'
import { DebtStrategies } from './DebtStrategies.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { SvgChart } from '../components/ui/chart.js'
import { Figure } from '../components/ui/type.js'
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
  return (
    <div className="-mx-4 space-y-4 bg-debt-page px-4 pb-6 text-debt-ink md:mx-0 md:rounded-xl">
      <header className="-mx-4 bg-debt-banner px-4 py-5 md:rounded-t-xl">
        {/* The banner's only words: large, where white reads at 3.5 to one. */}
        <div className="flex items-center gap-1 text-white">
          <h1 className="font-serif text-4xl italic">Debt payoff</h1>
          <HelpButton screen="debts" />
        </div>
      </header>
      {/* Plan 3.3: the debts here are not the Month's Debts list. */}
      <p className="text-sm">
        These are the loans and card balances you are paying down, to plan when each is paid off; they are separate
        from the Month&rsquo;s Debts list, which counts the payments you make each month.
      </p>
      <p className="text-xs">
        A card you pay off from your bank can go here too, but give it no monthly amount on the Month&rsquo;s Debts
        list: what you bought on it is already counted there.
      </p>
      {state.status === 'loading' ? <p className="py-8 text-center text-sm">Loading…</p> : null}
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
            <p className="rounded-xl bg-card p-4 text-sm shadow-sm">No debts yet. Add one to see when it is paid off.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
          <Button
            onClick={() => {
              setNotice(null)
              setEditing('new')
            }}
          >
            Add a debt
          </Button>
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
    <section aria-label="Debt summary" className="grid grid-cols-[1fr_auto] gap-4 rounded-xl bg-card p-4 shadow-sm">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Current debt total">
          <Figure className="text-2xl font-bold">{formatCents(t.balanceCents)}</Figure>
        </Stat>
        <Stat label="Debt-free by">
          <span className="text-lg font-semibold">{leftOut.length > 0 ? 'Not until every minimum covers its interest' : formatMonthTitle(debtFree)}</span>
        </Stat>
        <Stat label="Paid this month">
          <span className="tnum">{formatCents(t.paymentCents)}</span>
        </Stat>
        <Stat label="Payoff progress">
          <span className="tnum">{t.progressBp === null ? '—' : formatBasisPoints(t.progressBp)}</span>
          <span className="tnum block text-xs">
            {formatCents(t.paidCents)} of {formatCents(t.startingBalanceCents)}
          </span>
        </Stat>
      </dl>
      <Ring label="All debts" paidBp={t.progressBp ?? 10_000} className="w-24" />
      {vs === null ? null : (
        <div role="group" aria-label="Compared with a month ago" className="col-span-2 border-t border-current/20 pt-3 text-sm">
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
        <p className="col-span-2 text-xs">Not in these totals, because they are never paid off: {leftOut.join(', ')}.</p>
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
    <section aria-label={row.name} className="overflow-hidden rounded-xl bg-card shadow-sm">
      <h2 className="break-words px-4 pt-3 font-title text-3xl font-bold [overflow-wrap:anywhere]">{row.name}</h2>
      <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3">
        <div>
          <p className="text-xs text-debt-label">Balance today</p>
          {/* No standing is a debt never paid off: its balance is not worked out. */}
          <Figure className="text-2xl font-bold">{standing === null ? '—' : formatCents(standing.balanceCents)}</Figure>
          {standing === null ? <p className="text-xs">Not worked out, since it is never paid off</p> : null}
          {standing !== null && standing.month === null ? (
            <p className="text-xs">Starts {formatMonthTitle(row.start_date)}</p>
          ) : null}
          {vs === null || monthAgo === null ? null : (
            <p className="text-xs">
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
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 px-4 pb-4 text-sm">
        <Stat label="Starting balance">
          <span className="tnum">{formatCents(row.starting_balance_cents)}</span>
        </Stat>
        <Stat label="APR">
          <span className="tnum">{formatRate(row.apr_basis_points)}</span>
        </Stat>
        <Stat label="Minimum payment">
          <span className="tnum">{formatCents(row.minimum_payment_cents)}</span>
        </Stat>
        <Stat label="Paid off in">{standing === null ? 'Never' : formatMonthTitle(standing.paidOffIn)}</Stat>
      </dl>
      <div className="px-4 pb-4">
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

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-debt-label">{label}</dt>
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
