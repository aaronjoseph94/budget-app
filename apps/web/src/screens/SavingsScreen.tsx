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
import { linkFund, type FundRow, type ListedGoalRow } from '../ledger.js'
import { makeGoalAFund } from '../goal-writes.js'
import { atEndOf, LIST_HEADING } from '../lists.js'
import { hashOf, navigate } from '../nav.js'
import { formatBasisPoints, formatCents, formatIsoDate, todayIso } from '../format.js'
import { FundEditor } from './FundEditor.js'
import { AddGoalSheet } from './AddGoalSheet.js'
import { GoalActions } from './GoalActions.js'
import { Alert, Badge, Loading } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon, type IconName } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { HelpButton } from '../help/HelpButton.js'
import { useCoachRead } from '../coach/facts.js'
import { goalsForCore } from '../coach/goals.js'
import { GoalLever } from '../coach/GoalLever.js'
import { useGoalOutlooks } from '../coach/outlook.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { TryAgain } from '../try-again.js'

/**
 * The workbook's Savings tab (S16): a yellow card for every goal, with what
 * is in it, the amount needed and, from its dates, what to save each month
 * ("How To Reach These Goals", rows 14–20). The goals come in the owner's
 * order, the main goal first (F45); then each Savings-list fund with no goal
 * yet, in the list's order (Savings!C4 = START HERE!H7…); then, folded away,
 * the goals paused or reached (D28).
 *
 * Every figure is packages/core's (savingsFunds): the balance typed once and
 * kept by transfers since (D16), the plan (F21, with D15 and D22 saying why
 * there is no monthly figure), the bar's basis points. Names are plain text.
 */
export function SavingsScreen() {
  const state = useFunds()
  const { supabase, userId, refresh, categories, goals, mainGoal, goalsOrdered } = useAppData()
  const comparison = useSavedThisMonth(categories)
  // The year the Coach reads, for each goal's pace and its levers (F33, F34).
  const year = useCoachRead()
  const coreGoals = useMemo(() => goalsForCore(goals, state), [goals, state])
  const outlooks = useGoalOutlooks(year, coreGoals)
  // Each active goal's top lever (F34): what to trim to get there sooner.
  const leverOf = (goal: ListedGoalRow): ReactNode => {
    const top = outlooks.status === 'ready' ? outlooks.byGoal.get(goal.id)?.levers.offered[0] : undefined
    const category = top === undefined ? undefined : categories.find((c) => c.id === top.categoryId)
    return top === undefined || category === undefined ? null : (
      <div className="rounded-lg border px-3 py-2">
        <GoalLever lever={top} categoryName={category.name} unitLabel={goal.unit_label} />
      </div>
    )
  }
  const [editing, setEditing] = useState<string | null>(null)
  // A goal on no fund, edited by its own id: it has no fund to name it by.
  const [editingLoose, setEditingLoose] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const ready = state.status === 'ready' ? state : null
  const goalOf = (fund: SavingsFund) => ready?.goals.find((g) => g.id === fund.figures?.goalId) ?? null
  // Goals on no fund, such as the one Settings saved before there were funds:
  // each can become a fund's goal, keeping what was typed in it.
  const unlinked = ready === null ? [] : ready.goals.filter((g) => ready.funds.unlinked.some((u) => u.goalId === g.id))
  const shown = ready?.funds.funds.find((f) => f.categoryId === editing) ?? null
  const looseRow = ready?.goals.find((g) => g.id === editingLoose)
  const looseFigures = ready?.funds.unlinked.find((u) => u.goalId === editingLoose)
  const active = goals.filter((g) => g.status === 'active')
  const folded = goals.filter((g) => g.status !== 'active')
  const withoutGoal = ready === null ? [] : ready.funds.funds.filter((f) => f.figures === null)
  // Marked only when there is more than one to lead; a paused or reached goal says which it is.
  const badge = (goal: ListedGoalRow) =>
    goal.status === 'paused' ? (
      <Badge variant="outline">Paused</Badge>
    ) : goal.status === 'reached' ? (
      <Badge variant="outline">Reached{goal.reached_on === null ? '' : ` ${formatIsoDate(goal.reached_on)}`}</Badge>
    ) : active.length > 1 && goal.id === mainGoal?.id ? (
      <Badge variant="default">Main goal</Badge>
    ) : null
  const cardOf = (goal: ListedGoalRow) => {
    const row = ready?.goals.find((g) => g.id === goal.id)
    const fund = ready?.funds.funds.find((f) => f.figures?.goalId === goal.id)
    const loose = ready?.funds.unlinked.find((u) => u.goalId === goal.id)
    const figures = fund?.figures ?? loose
    const actions =
      figures === undefined || figures === null ? null : (
        <GoalActions
          goal={goal}
          saved={figures}
          onFund={fund !== undefined}
          onEdit={fund === undefined ? () => setEditingLoose(goal.id) : () => setEditing(fund.categoryId)}
          onNotice={setNotice}
        />
      )
    if (row !== undefined && fund !== undefined) {
      return (
        <FundCard
          fund={fund}
          goal={row}
          comparison={comparison}
          badge={badge(goal)}
          lever={leverOf(goal)}
          actions={actions}
          onEdit={() => setEditing(fund.categoryId)}
        />
      )
    }
    if (row !== undefined && loose !== undefined) {
      return (
        <LooseGoalCard goal={row} figures={loose} badge={badge(goal)} lever={leverOf(goal)} actions={actions} onMakeFund={() => void makeFund(row)} />
      )
    }
    // Saved a moment ago, and the funds not read again yet.
    return <p className="rounded-xl border bg-card p-4 text-sm">{goal.name}: loading…</p>
  }

  // A goal on no fund gets the Savings fund of its name, made when there is none.
  const makeFund = async (goal: FundRow) => {
    setNotice(null)
    const taken = categories.find((c) => c.name === goal.name)
    if (taken !== undefined && taken.kind !== 'savings') {
      setNotice({ ok: false, text: `${goal.name} is on your ${LIST_HEADING[taken.kind]} list. Move it to Savings in Setup, then press Make it a fund again.` })
      return
    }
    try {
      await makeGoalAFund(supabase, userId, atEndOf(categories, goal.name, 'savings'), { goalId: goal.id, asOf: todayIso() })
      setNotice({ ok: true, text: `${goal.name} is now a fund on your Savings list. Money you move into it after today adds to it.` })
      await refresh()
    } catch (cause) {
      setNotice({ ok: false, text: cause instanceof Error ? cause.message : 'Could not make it a fund. Nothing was saved.' })
    }
  }

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

  // Mockup A: the Month's title row, with Add a goal on its right from 640px;
  // then the month's saving, the goals three across from 1280px, the funds
  // with no goal, and the folded goals, in the order a phone reads them.
  return (
    <div className="space-y-4 xl:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>Savings goals</MonthTitle>
            <HelpButton screen="savings" />
          </div>
          <p className="text-muted-foreground md:text-base">Your goals: what each needs, and what to put in it each month to get there by its date.</p>
        </div>
        {ready === null ? null : (
          <Button className="w-full sm:w-auto" onClick={() => setAdding(true)}>
            <Icon name="plus" /> Add a goal
          </Button>
        )}
      </header>
      {state.status === 'loading' ? <Loading what="your savings goals" /> : null}
      {notice !== null ? <Alert tone={notice.ok ? 'success' : 'error'}>{notice.text}</Alert> : null}
      {state.status === 'failed' ? <Alert tone="error" title="Could not load your savings funds">{state.message}{state.missingUpdate ? null : <> <TryAgain />.</>}</Alert> : null}
      {comparison === null ? null : (
        // A card but not a region: the regions on this screen are the funds.
        // Tinted to Savings' amber, the list it counts (ADR 0010).
        <div className="rounded-xl border bg-linear-to-r from-card to-savings-band p-4 text-sm md:px-6 md:py-5">
          <h2 className="font-semibold md:text-base">Saved this month</h2>
          <CompareLine comparison={comparison} label="Compared with last month" earlier="last month" pick={(c) => c.summary.saved} word="saved" />
        </div>
      )}
      {state.status === 'ready' && state.funds.funds.length === 0 && goals.length === 0 ? (
        <div className="rounded-xl border bg-card p-4 text-sm">
          <p>Your Savings list has no funds yet. Each fund on it gets a card here.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate('setup')}>
            Add funds in Setup
          </Button>
        </div>
      ) : null}
      {ready === null ? null : (
        <>
          {goalsOrdered || goals.length === 0 ? null : (
            <p className="text-sm">
              Choosing your main goal, moving goals, and pausing or finishing one need a one-time update.{' '}
              <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
                See One-time updates
              </a>
            </p>
          )}
          {active.length === 0 ? null : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
              {active.map((goal) => (
                <li key={goal.id}>{cardOf(goal)}</li>
              ))}
            </ul>
          )}
          {withoutGoal.length === 0 ? null : (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Funds with no goal yet</h2>
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5">
                {withoutGoal.map((fund) => (
                  <li key={fund.categoryId}>
                    <FundCard fund={fund} goal={goalOf(fund)} comparison={comparison} onEdit={() => setEditing(fund.categoryId)}>
                      {unlinked.map((g) => (
                        <Button key={g.id} variant="outline" size="sm" className="mr-2" onClick={() => void link(g, fund)}>
                          Use “{g.name}” for this fund
                        </Button>
                      ))}
                    </FundCard>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {folded.length === 0 ? null : (
            <details className="rounded-xl border bg-card px-4 md:px-6">
              <summary className="flex min-h-14 cursor-pointer items-center font-semibold">Reached and paused ({folded.length})</summary>
              <ul className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-2 xl:grid-cols-3 xl:gap-5 md:pb-6">
                {folded.map((goal) => (
                  <li key={goal.id}>{cardOf(goal)}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      {adding && ready !== null ? (
        <AddGoalSheet
          goalOnFund={new Set(ready.funds.funds.flatMap((f) => (f.figures === null ? [] : [f.categoryId])))}
          onClose={() => setAdding(false)}
          onSaved={(text) => {
            setAdding(false)
            setNotice({ ok: true, text })
          }}
          onFailedAfterClose={(text) => setNotice({ ok: false, text })}
        />
      ) : null}
      {looseRow !== undefined && looseFigures !== undefined ? (
        <FundEditor
          key={looseRow.id}
          fund={{ categoryId: null, name: looseRow.name, figures: looseFigures }}
          goal={looseRow}
          onClose={() => setEditingLoose(null)}
          onSaved={(text) => {
            setEditingLoose(null)
            setNotice({ ok: true, text })
          }}
          onFailedAfterClose={(text) => setNotice({ ok: false, text })}
        />
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
  badge = null,
  lever = null,
  actions = null,
  onEdit,
  children = null,
}: {
  fund: SavingsFund
  goal: FundRow | null
  comparison: PeriodComparison | 'failed' | null
  badge?: ReactNode
  /** What to trim to reach an active goal sooner (F34). */
  lever?: ReactNode
  /** A goal's buttons; with none, Edit goal alone. */
  actions?: ReactNode
  onEdit: () => void
  children?: ReactNode
}) {
  const row = comparison === null || comparison === 'failed' || comparison.status !== 'compared' ? null : comparison
  const mine = row?.blocks.savings.rows.find((r) => r.categoryId === fund.categoryId) ?? null
  const f = fund.figures
  return (
    <section aria-label={fund.name} className={CARD}>
      <Title name={fund.name} badge={badge} icon={goal === null || goal.unit_cost_cents === null ? 'piggy' : 'plane'} />
      {f === null || goal === null ? (
        <div className="space-y-3 px-4 py-4 text-sm md:px-5">
          <p>No goal yet.</p>
          <div className="flex flex-wrap gap-y-2">
            {children}
            <Button size="sm" onClick={onEdit}>
              Set a goal
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col space-y-3 px-4 py-4 md:px-5">
          <GoalFigures figures={f} goal={goal} />
          {lever}
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
          <div className="mt-auto">
            {actions ?? (
              <Button variant="outline" size="sm" onClick={onEdit}>
                Edit goal
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Mockup A's goal card: white, an amber title strip, the words in ink. It
 * fills its grid cell, its actions at its foot, so cards side by side are
 * one height with their buttons level (V17).
 */
const CARD = 'flex h-full flex-col overflow-hidden rounded-xl border bg-card'

/** The strip: Savings' icon tile, a plane for a goal counted in hours as the sidebar draws it, the name and its badge. */
function Title({ name, badge, icon }: { name: string; badge: ReactNode; icon: IconName }) {
  return (
    <div className="flex items-center gap-3 bg-savings-title px-4 py-3 md:px-5">
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-savings-tile text-savings-accent">
        <Icon name={icon} className="size-[1.125rem]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="min-w-0 break-words text-lg font-semibold leading-tight [overflow-wrap:anywhere]">{name}</h2>
        {badge}
      </div>
    </div>
  )
}

/**
 * A goal on no fund: saved in Settings before there were funds, or its fund
 * moved off the Savings list (N52). What was typed is its balance, and no
 * transfer counts until it is a fund's goal. Labelled apart from a fund of
 * the same name, which can take it.
 */
function LooseGoalCard({
  goal,
  figures,
  badge,
  lever,
  actions,
  onMakeFund,
}: {
  goal: FundRow
  figures: FundFigures
  badge: ReactNode
  lever: ReactNode
  actions: ReactNode
  onMakeFund: () => void
}) {
  return (
    <section aria-label={`${goal.name}, on no fund`} className={CARD}>
      <Title name={goal.name} badge={badge} icon={goal.unit_cost_cents === null ? 'piggy' : 'plane'} />
      <div className="flex flex-1 flex-col space-y-3 px-4 py-4 md:px-5">
        <p className="text-sm">On no savings fund yet, so money moved to savings does not count toward it.</p>
        <Button variant="outline" size="sm" onClick={onMakeFund}>
          Make it a fund
        </Button>
        <GoalFigures figures={figures} goal={goal} />
        {lever}
        <div className="mt-auto">{actions}</div>
      </div>
    </section>
  )
}

/** What a goal holds, what it needs, its dates and what to save a month: the workbook's card. */
function GoalFigures({ figures: f, goal }: { figures: FundFigures; goal: FundRow }) {
  return (
    <>
      <p>
        <Figure className="text-3xl font-bold">{formatCents(f.balanceCents)}</Figure>
        <span className="tnum whitespace-nowrap text-sm text-muted-foreground"> saved of {formatCents(f.goalCents)}</span>
      </p>
      <Bar figures={f} />
      <div className="rounded-lg bg-savings-needed px-3 py-2.5">
        <p className="text-xs font-medium text-savings-ink">Amount needed{f.reached ? ' · goal reached' : ''}</p>
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
      {f.plan.status === 'planned' ? null : <p className="text-sm text-muted-foreground">{WHY_NO_MONTHLY[f.plan.status]}</p>}
      <Kept figures={f} goal={goal} />
    </>
  )
}

/** Why a fund has no monthly figure, where the workbook would show $0 (D15, D22). */
const WHY_NO_MONTHLY: Readonly<Record<Exclude<SavingsFundPlan['status'], 'planned'>, string>> = {
  'no-dates': 'No dates yet. Add a start date and a goal date to see what to save each month.',
  'goal-before-start': 'The goal date is before the start date, so there is no monthly figure.',
  'under-a-month': 'The goal date is less than a month after the start date, so there is no monthly figure.',
}

/** The card's bar: Savings' amber over its tile, its length core's basis points. */
function Bar({ figures }: { figures: FundFigures }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-savings-tile" role="presentation">
        <div className="h-full rounded-full bg-savings-bar" style={{ width: `${figures.progressBp / 100}%` }} />
      </div>
      <span className="tnum text-xs font-semibold">{formatBasisPoints(figures.progressBp)}</span>
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
    <div className="space-y-3 text-xs text-muted-foreground">
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
        <p className="rounded-lg bg-primary-soft px-3 py-2 text-sm text-foreground">
          About {units} hours of {goal.unit_label ?? 'your goal'} to go.
        </p>
      ) : null}
    </div>
  )
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
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
