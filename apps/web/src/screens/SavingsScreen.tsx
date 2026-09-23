import type { ReactNode } from 'react'
import { goalProgress, type FundFigures, type SavingsFund, type SavingsFundPlan } from '@budget/core'
import { useFunds } from '../funds.js'
import type { FundRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { formatBasisPoints, formatCents, formatIsoDate } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Figure } from '../components/ui/type.js'

/**
 * Workbook's Savings tab (S16): a yellow card for every fund on the Savings
 * list, in the list's order (Savings!C4 = START HERE!H7…), each with its
 * goal, what is in it, the amount needed and, from its dates, what to save
 * each month ("How To Reach These Goals", rows 14–20).
 *
 * Every figure is packages/core's (savingsFunds): the balance typed once and
 * kept by transfers since (D16), the plan (F21, with D15 and D22 saying why
 * there is no monthly figure), the bar's basis points. Names are plain text.
 */
export function SavingsScreen() {
  const state = useFunds()
  return (
    <div className="space-y-4">
      <header className="-mx-4 bg-savings-banner px-4 py-5 text-savings-ink md:mx-0 md:rounded-xl">
        <h1 className="font-serif text-4xl italic">Savings goals</h1>
        <p className="mt-1 text-sm">What each fund needs, and what to put in it each month to get there by its date.</p>
      </header>
      {state.status === 'loading' ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : null}
      {state.status === 'failed' ? <Alert tone="error" title="Could not load your savings funds">{state.message}</Alert> : null}
      {state.status === 'ready' ? (
        state.funds.funds.length === 0 ? (
          <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
            <p>Your Savings list has no funds yet. Each fund on it gets a card here.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('setup')}>
              Add funds in Setup
            </Button>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.funds.funds.map((fund) => (
              <li key={fund.categoryId}>
                <FundCard fund={fund} goal={state.goals.find((g) => g.id === fund.figures?.goalId) ?? null} />
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}

function FundCard({ fund, goal }: { fund: SavingsFund; goal: FundRow | null }) {
  const f = fund.figures
  return (
    <section aria-label={fund.name} className="overflow-hidden rounded-xl border border-savings-rule bg-card text-savings-ink shadow-sm">
      <h2 className="break-words bg-savings-title px-4 py-2 font-title text-3xl font-bold [overflow-wrap:anywhere]">{fund.name}</h2>
      {f === null || goal === null ? (
        <p className="px-4 py-4 text-sm">No goal yet.</p>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <p>
            <Figure className="text-3xl font-bold">{formatCents(f.balanceCents)}</Figure>
            <span className="tnum text-sm"> saved of {formatCents(f.goalCents)}</span>
          </p>
          <Bar figures={f} />
          <div className="rounded-lg bg-savings-needed px-3 py-2">
            <p className="text-xs font-medium">Amount needed{f.reached ? ' · goal reached' : ''}</p>
            <Figure className="text-2xl font-bold">{formatCents(f.plan.amountNeededCents)}</Figure>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
            <Item label="Start date">{goal.start_date === null ? 'Not set' : formatIsoDate(goal.start_date)}</Item>
            <Item label="Goal date">{goal.target_date === null ? 'Not set' : formatIsoDate(goal.target_date)}</Item>
            <Item label="Months remaining">{f.plan.monthsRemaining === null ? '—' : String(f.plan.monthsRemaining)}</Item>
            <Item label="Monthly contribution">
              {f.plan.monthlyContributionCents === null ? '—' : <span className="tnum font-semibold">{formatCents(f.plan.monthlyContributionCents)}</span>}
            </Item>
          </dl>
          {f.plan.status === 'planned' ? null : <p className="text-sm">{WHY_NO_MONTHLY[f.plan.status]}</p>}
          <Kept figures={f} goal={goal} />
        </div>
      )}
    </section>
  )
}

/** Why a fund has no monthly figure, where Workbook would show $0 (D15, D22). */
const WHY_NO_MONTHLY: Readonly<Record<Exclude<SavingsFundPlan['status'], 'planned'>, string>> = {
  'no-dates': 'No dates yet. Add a start date and a goal date to see what to save each month.',
  'goal-before-start': 'The goal date is before the start date, so there is no monthly figure.',
  'under-a-month': 'The goal date is less than a month after the start date, so there is no monthly figure.',
}

/** The card's bar: #FAC935 over the savings rule, its length core's basis points. */
function Bar({ figures }: { figures: FundFigures }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-savings-rule" role="presentation">
        <div className="h-full rounded-full bg-savings-bar" style={{ width: `${figures.progressBp / 100}%` }} />
      </div>
      <span className="tnum text-xs font-medium">{formatBasisPoints(figures.progressBp)}</span>
    </div>
  )
}

/** Where the balance came from (D16), and the goal as time, as the Week says it. */
function Kept({ figures, goal }: { figures: FundFigures; goal: FundRow }) {
  const units =
    goal.unit_cost_cents === null
      ? null
      : goalProgress({ name: goal.name, targetCents: goal.target_cents, savedCents: figures.balanceCents, unitCostCents: goal.unit_cost_cents }).unitsRemaining
  return (
    <div className="space-y-1 text-xs">
      {goal.balance_as_of === null ? null : (
        <p>
          {formatCents(goal.saved_cents)} typed on {formatIsoDate(goal.balance_as_of)}
          {figures.transfersCents === 0 ? ', nothing moved in since.' : `, and ${formatCents(figures.transfersCents)} moved in since.`}
        </p>
      )}
      {units !== null && units > 0 ? (
        <p className="rounded-lg bg-savings-header px-2 py-1.5 text-sm">
          About {units} hours of {goal.unit_label ?? 'your goal'} to go.
        </p>
      ) : null}
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
