import { useEffect, useState } from 'react'
import { balanceLine } from '@budget/chart-specs'
import { debtPlan, type CashFlow30, type ScaledSeries } from '@budget/core'
import { useAppData } from '../app-data.js'
import { debtsForCore } from '../debts.js'
import { listDebtExtras, listDebts, needsOneTimeUpdate } from '../ledger.js'
import { formatCents, formatDayMonth, formatMonthTitle } from '../format.js'
import { hashOf } from '../nav.js'
import { SvgChart, fitted } from '../components/ui/chart.js'
import { Section } from './parts.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { TryAgain } from '../try-again.js'

/**
 * The Forecast's next 30 days (F32): the tightest day, the line, the bills
 * due in the next week, and what the line leaves out, all cashFlow30's.
 */
export function NextDaysCard({ flow, line, asOf, names }: { flow: CashFlow30; line: ScaledSeries | null; asOf: string; names: (id: string) => string }) {
  const { lowest, todayCents } = flow
  // The line's points are today, then each day; the tightest is found among them by its date.
  const dates = [asOf, ...flow.days.map((d) => d.date)]
  const last = flow.days.at(-1)
  return (
    <Section title="The next 30 days" large>
      {/* Without this month's start there is no line; Safe to spend asks for it. */}
      {lowest === null || todayCents === null || line === null || last === undefined ? null : (
        <>
          <p>
            Today: <span className="tnum font-semibold">{formatCents(todayCents)}</span>. Tightest day ahead:{' '}
            <span className="font-semibold">{formatDayMonth(lowest.date)}</span>, at{' '}
            <span className="tnum font-semibold">{formatCents(lowest.balanceCents)}</span>.
          </p>
          <SvgChart
            svg={fitted(balanceLine, {
              id: 'forecast-next-30',
              title: 'The next 30 days',
              description: `Your balance from today to ${formatDayMonth(last.date)}; lowest on ${formatDayMonth(lowest.date)}, at ${formatCents(lowest.balanceCents)}.`,
              pointsBp: line.bps,
              zeroBp: line.zeroBp,
              lowestIndex: dates.indexOf(lowest.date),
              lowestText: `${formatDayMonth(lowest.date)}: ${formatCents(lowest.balanceCents)}`,
              startText: 'Today',
              endText: formatDayMonth(last.date),
            })}
            className="mx-auto max-w-md"
          />
          <p className="text-muted-foreground">
            {flow.dailyVariableCents === null
              ? 'Everyday spending is left out until there are 14 days of records.'
              : `Counts ${formatCents(flow.dailyVariableCents)} a day of everyday spending, your average over the last ${flow.variableDays} days.`}
          </p>
        </>
      )}
      <h3 className="pt-1 font-semibold">Bills due in the next 7 days</h3>
      {flow.billsNext7.length === 0 ? (
        <p className="text-muted-foreground">None.</p>
      ) : (
        <ul className="divide-y border-t">
          {flow.billsNext7.map((b) => (
            <li key={`${b.date} ${b.categoryId}`} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="text-muted-foreground">{formatDayMonth(b.date)}</span> <span className="[overflow-wrap:anywhere]">{names(b.categoryId)}</span>
                {b.seen === 'not_seen' ? <span className="block text-xs text-muted-foreground">Due, not seen yet</span> : null}
              </span>
              <span className="tnum whitespace-nowrap font-medium">{formatCents(b.cents)}</span>
            </li>
          ))}
        </ul>
      )}
      {flow.savingsNotMovedCents > 0 ? (
        <p className="text-muted-foreground">Leaves out {formatCents(flow.savingsNotMovedCents)} you still plan to move to savings this month.</p>
      ) : null}
      {/* A source left out has no schedule, or a schedule with no receipt or goal to say what it pays (F29). */}
      {flow.payLeftOut.length === 0 ? null : (
        <p className="text-muted-foreground">Leaves out pay from {flow.payLeftOut.map(names).join(' and ')}: the app can’t tell yet when it comes or how much.</p>
      )}
    </Section>
  )
}

type DebtFree =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly missingUpdate: boolean }
  | { readonly status: 'ready'; readonly date: string | null; readonly neverPaidOff: readonly string[]; readonly debts: number }

/** The debt-free date from the payoff plan the Debts screen shows (debtPlan). Its read fails on its own. */
export function DebtFreeCard() {
  const { supabase, version } = useAppData()
  const [state, setState] = useState<DebtFree>({ status: 'loading' })
  useEffect(() => {
    let live = true
    Promise.all([listDebts(supabase), listDebtExtras(supabase)])
      .then(([rows, extras]) => {
        const plan = debtPlan(debtsForCore(rows, extras))
        if (live) setState({ status: 'ready', date: plan.amortization?.debtFreeDate ?? null, neverPaidOff: plan.neverPaidOff, debts: rows.length })
      })
      .catch((cause: unknown) => live && setState({ status: 'failed', missingUpdate: needsOneTimeUpdate(cause) }))
    return () => {
      live = false
    }
  }, [supabase, version])
  const debts = (
    <a href={hashOf({ screen: 'debts', param: null })} className={SENTENCE_LINK}>
      Open Debts
    </a>
  )
  return (
    <Section title="Debt-free" large>
      {state.status === 'loading' ? <p className="text-muted-foreground">Loading your payoff plan…</p> : null}
      {state.status === 'failed' && state.missingUpdate ? (
        <p>
          Your debt-free date needs a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
            See One-time updates
          </a>
        </p>
      ) : null}
      {state.status === 'failed' && !state.missingUpdate ? <p className="text-muted-foreground">Your debt-free date did not load. <TryAgain />.</p> : null}
      {state.status === 'ready' ? (
        <p>
          {state.debts === 0
            ? 'No debts on your payoff plan. '
            : state.neverPaidOff.length > 0 || state.date === null
              ? 'Not until every minimum covers its interest. '
              : `Debt-free by ${formatMonthTitle(state.date)} on your payoff plan. `}
          {debts}
        </p>
      ) : null}
    </Section>
  )
}
