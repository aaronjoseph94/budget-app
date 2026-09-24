import { useMemo, useState, type ReactNode } from 'react'
import {
  goalProgress,
  isoDate,
  monthBounds,
  periodComparison,
  shiftMonth,
  type FundFigures,
  type PeriodComparison,
  type SavingsFund,
  type SavingsFundPlan,
} from '@budget/core'
import { useEarlier } from '../earlier.js'
import { categoriesForCore, entriesForCore } from '../sheet-input.js'
import { CompareLine } from './CompareLine.js'
import { useAppData } from '../app-data.js'
import { useFunds } from '../funds.js'
import { linkFund, type FundRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { formatBasisPoints, formatCents, formatIsoDate, todayIso } from '../format.js'
import { FundEditor } from './FundEditor.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Figure } from '../components/ui/type.js'
import { HelpButton } from '../help/HelpButton.js'

/**
 * The workbook's Savings tab (S16): a yellow card for every fund on the Savings
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
  const { supabase, refresh, categories } = useAppData()
  const comparison = useSavedThisMonth(categories)
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const ready = state.status === 'ready' ? state : null
  const goalOf = (fund: SavingsFund) => ready?.goals.find((g) => g.id === fund.figures?.goalId) ?? null
  // Goals on no fund, such as the one Settings saved before there were funds:
  // each can become a fund's goal, keeping what was typed in it.
  const unlinked = ready === null ? [] : ready.goals.filter((g) => ready.funds.unlinked.some((u) => u.goalId === g.id))
  const shown = ready?.funds.funds.find((f) => f.categoryId === editing) ?? null

  const link = async (goal: FundRow, fund: SavingsFund) => {
    setNotice(null)
    try {
      await linkFund(supabase, { goalId: goal.id, categoryId: fund.categoryId, asOf: todayIso() })
      setNotice({ ok: true, text: `“${goal.name}” is now ${fund.name}'s goal.` })
      await refresh()
    } catch (cause) {
      setNotice({ ok: false, text: cause instanceof Error ? cause.message : 'Could not use that goal. Nothing was saved.' })
    }
  }

  return (
    <div className="space-y-4">
      <header className="-mx-4 bg-savings-banner px-4 py-5 text-savings-ink md:mx-0 md:rounded-xl">
        <div className="flex items-center gap-1">
          <h1 className="font-serif text-4xl italic">Savings goals</h1>
          <HelpButton screen="savings" />
        </div>
        <p className="mt-1 text-sm">What each fund needs, and what to put in it each month to get there by its date.</p>
      </header>
      {state.status === 'loading' ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : null}
      {notice !== null ? <Alert tone={notice.ok ? 'success' : 'error'}>{notice.text}</Alert> : null}
      {state.status === 'failed' ? <Alert tone="error" title="Could not load your savings funds">{state.message}</Alert> : null}
      {comparison === null ? null : (
        // A card but not a region: the regions on this screen are the funds.
        <div className="rounded-xl border bg-card p-4 text-sm shadow-sm">
          <h2 className="font-medium">Saved this month</h2>
          <CompareLine comparison={comparison} label="Compared with last month" earlier="last month" pick={(c) => c.summary.saved} word="saved" />
        </div>
      )}
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
                <FundCard fund={fund} goal={goalOf(fund)} comparison={comparison} onEdit={() => setEditing(fund.categoryId)}>
                  {fund.figures === null
                    ? unlinked.map((g) => (
                        <Button key={g.id} variant="outline" size="sm" className="mr-2" onClick={() => void link(g, fund)}>
                          Use “{g.name}” for this fund
                        </Button>
                      ))
                    : null}
                </FundCard>
              </li>
            ))}
          </ul>
        )
      ) : null}
      {shown !== null ? (
        <FundEditor
          key={shown.categoryId}
          fund={shown}
          goal={goalOf(shown)}
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

function FundCard({
  fund,
  goal,
  comparison,
  onEdit,
  children,
}: {
  fund: SavingsFund
  goal: FundRow | null
  comparison: PeriodComparison | 'failed' | null
  onEdit: () => void
  children: ReactNode
}) {
  const row = comparison === null || comparison === 'failed' || comparison.status !== 'compared' ? null : comparison
  const mine = row?.blocks.savings.rows.find((r) => r.categoryId === fund.categoryId) ?? null
  const f = fund.figures
  return (
    <section aria-label={fund.name} className="overflow-hidden rounded-xl border border-savings-rule bg-card text-savings-ink shadow-sm">
      <h2 className="break-words bg-savings-title px-4 py-2 font-title text-3xl font-bold [overflow-wrap:anywhere]">{fund.name}</h2>
      {f === null || goal === null ? (
        <div className="space-y-3 px-4 py-4 text-sm">
          <p>No goal yet.</p>
          <div className="flex flex-wrap gap-y-2">
            {children}
            <Button size="sm" onClick={onEdit}>
              Set a goal
            </Button>
          </div>
        </div>
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
          {/* This fund's line only when there is one; the card above says why when there is not. */}
          {row === null || mine === null ? null : (
            <CompareLine
              comparison={row}
              label={`${fund.name} compared with last month`}
              earlier="last month"
              pick={() => mine}
              word="saved"
            />
          )}
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit goal
          </Button>
        </div>
      )}
    </section>
  )
}

/** Why a fund has no monthly figure, where the workbook would show $0 (D15, D22). */
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
          {figures.transfersCents === 0
            ? ', nothing moved in since.'
            : figures.transfersCents > 0
              ? `, and ${formatCents(figures.transfersCents)} moved in since.`
              : // More taken back out than moved in: say so, rather than "-$10.00 moved in".
                `; since then, more was taken out than moved in, a change of ${formatCents(figures.transfersCents)}.`}
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


/**
 * Saved this month against the same days last month (F25, D26): the Savings
 * block's Actual, in total and for each fund, from periodComparison. Last
 * month and this month to today are read together, beside the funds, so if
 * the read fails only the comparison goes. Only Actuals are compared, and
 * no fund has a monthly amount, so no plans are read.
 */
function useSavedThisMonth(categories: Parameters<typeof categoriesForCore>[0]): PeriodComparison | 'failed' | null {
  const today = isoDate(todayIso())
  const month = monthBounds(today).start
  const read = useEarlier({ from: shiftMonth(month, -1), to: today })
  return useMemo(() => {
    if (read === null || read === 'failed') return read
    try {
      return periodComparison({
        period: 'month',
        month,
        asOf: today,
        historyStart: read.historyStart === null ? null : isoDate(read.historyStart),
        categories: categoriesForCore(categories),
        planHistory: [],
        entries: entriesForCore(read.rows),
      })
    } catch {
      return 'failed'
    }
  }, [read, categories, month, today])
}
