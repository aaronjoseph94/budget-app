import { useState } from 'react'
import { goalProgress } from '@budget/core'
import { useAppData } from '../app-data.js'
import { useFunds } from '../funds.js'
import type { ListedGoalRow } from '../ledger.js'
import { formatCents } from '../format.js'
import { hashOf } from '../nav.js'
import { AddGoalSheet, type GoalPreset } from '../screens/AddGoalSheet.js'
import { Alert, Badge } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'

/**
 * The flight-training goal as the plan names it (§8.1 step 5): $30,000 at
 * $275 an hour of flight time. Offered, filled in, only when there is no
 * goal yet; every figure in it can be changed before Add goal is pressed.
 */
const FLIGHT: GoalPreset = { name: 'Flight training', target: '30000', unit: { inHours: true, cost: '275', label: 'flight time' } }

/**
 * Step 5, your savings goals (G1): every active goal, the main goal first,
 * each with what is saved of its target, and a goal kept in hours (the
 * flight goal's flight time) with the hours still to go. Then Add another,
 * through Savings' own Add a goal sheet.
 */
export function GoalsStep() {
  const { goals, mainGoal } = useAppData()
  const funds = useFunds()
  const [adding, setAdding] = useState<GoalPreset | null>(null)
  const [notice, setNotice] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)
  const active = goals.filter((g) => g.status === 'active')
  const ready = funds.status === 'ready' ? funds : null
  const saved = (goal: ListedGoalRow): number | null => {
    const figures = ready?.funds.funds.find((f) => f.figures?.goalId === goal.id)?.figures ?? ready?.funds.unlinked.find((u) => u.goalId === goal.id)
    return figures === undefined || figures === null ? null : figures.balanceCents
  }

  return (
    <div className="space-y-3">
      {active.length === 0 ? null : (
        <ul className="divide-y rounded-xl border bg-card px-4">
          {active.map((goal) => (
            <GoalLine key={goal.id} goal={goal} main={active.length > 1 && goal.id === mainGoal?.id} saved={saved(goal)} />
          ))}
        </ul>
      )}
      {notice === null ? null : <Alert tone={notice.ok ? 'success' : 'error'}>{notice.text}</Alert>}
      {funds.status === 'failed' ? <Alert tone="error">{funds.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {active.length === 0 ? (
          <>
            <Button disabled={ready === null} onClick={() => setAdding(FLIGHT)}>
              <Icon name="plane" /> Add your flight-training goal
            </Button>
            <Button variant="outline" disabled={ready === null} onClick={() => setAdding({})}>
              <Icon name="plus" /> Add a different goal
            </Button>
          </>
        ) : (
          <Button variant="outline" disabled={ready === null} onClick={() => setAdding({})}>
            <Icon name="plus" /> Add another
          </Button>
        )}
      </div>
      <a href={hashOf({ screen: 'savings', param: null })} className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
        Change a goal, or what is saved, on Savings
      </a>
      {adding === null || ready === null ? null : (
        <AddGoalSheet
          preset={adding}
          goalOnFund={new Set(ready.funds.funds.flatMap((f) => (f.figures === null ? [] : [f.categoryId])))}
          onClose={() => setAdding(null)}
          onSaved={(text) => {
            setAdding(null)
            setNotice({ ok: true, text })
          }}
          onFailedAfterClose={(text) => setNotice({ ok: false, text })}
        />
      )}
    </div>
  )
}

/** One goal: its name, what is saved of its target, and for a goal in hours, the hours to go. */
function GoalLine({ goal, main, saved }: { goal: ListedGoalRow; main: boolean; saved: number | null }) {
  const hours =
    saved === null || goal.unit_cost_cents === null
      ? null
      : goalProgress({ name: goal.name, targetCents: goal.target_cents, savedCents: saved, unitCostCents: goal.unit_cost_cents }).unitsRemaining
  return (
    <li className="space-y-0.5 py-3">
      <p className="flex min-w-0 items-center gap-2 font-medium">
        <span className="min-w-0 truncate" title={goal.name}>
          {goal.name}
        </span>
        {main ? <Badge>Main goal</Badge> : null}
      </p>
      <p className="tnum text-sm text-muted-foreground">
        {saved === null ? `Target ${formatCents(goal.target_cents)}` : `${formatCents(saved)} saved of ${formatCents(goal.target_cents)}`}
      </p>
      {hours !== null && hours !== undefined && hours > 0 ? (
        <p className="text-sm">
          About {hours} hours of {goal.unit_label ?? 'your goal'} to go.
        </p>
      ) : null}
    </li>
  )
}
