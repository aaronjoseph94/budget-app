import { useState, type ReactNode } from 'react'
import { goalAtEnd, goalsProgress, moveGoal } from '@budget/core'
import { placedGoal, useAppData } from '../app-data.js'
import { removeGoal, setGoalPlaces, setGoalState, type GoalStateChange, type ListedGoalRow } from '../ledger.js'
import { formatCents, todayIso } from '../format.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'

export interface Notice {
  readonly ok: boolean
  readonly text: string
}

/**
 * What can be done with one goal on Savings (F45): edit it, make it the main
 * goal, move it up or down among the active goals, pause it, mark it
 * reached, resume it, or remove it when nothing is saved in it. Every place
 * comes from core (moveGoal, goalAtEnd), and whether it holds money
 * (goalsProgress); this writes what comes back and reloads. Before 0015
 * only Edit and Remove are offered, and the screen says once, above the
 * goals, why the rest wait.
 */
export function GoalActions({
  goal,
  saved,
  onFund,
  onEdit,
  onNotice,
}: {
  goal: ListedGoalRow
  /** Its target and balance, as its card shows them (D16). */
  saved: { readonly goalCents: number; readonly balanceCents: number }
  /** Whether it is a Savings-list fund's goal, which stays when the goal goes. */
  onFund: boolean
  /** Null where this goal cannot be edited here. */
  onEdit: (() => void) | null
  onNotice: (notice: Notice) => void
}) {
  const { supabase, goals, mainGoal, goalsOrdered, refresh } = useAppData()
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [progress] = goalsProgress({ goals: [{ id: goal.id, targetCents: saved.goalCents, savedCents: saved.balanceCents, unitCostCents: null }] }).goals
  const active = goals.filter((g) => g.status === 'active')
  const at = active.findIndex((g) => g.id === goal.id)

  // Said when the main goal steps aside, since the Coach and the Week change with it.
  const next = mainGoal?.id === goal.id ? active.find((g) => g.id !== goal.id) : undefined
  const handover = next === undefined ? '' : ` ${next.name} is your main goal now.`

  const write = async (save: () => Promise<void>, done: string | null) => {
    setBusy(true)
    try {
      await save()
      if (done !== null) onNotice({ ok: true, text: done })
    } catch (cause) {
      onNotice({ ok: false, text: cause instanceof Error ? cause.message : 'Could not change that goal. Nothing was saved.' })
    }
    // What is stored now, changed or not.
    await refresh()
    setBusy(false)
  }
  const place = (to: 'up' | 'down' | 'first', done: string | null) =>
    write(() => setGoalPlaces(supabase, moveGoal({ goals: goals.map(placedGoal), id: goal.id, to }).changes), done)
  const state = (change: GoalStateChange, done: string) => write(() => setGoalState(supabase, goal.id, change), done)
  const reach = (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={() =>
        void state({ status: 'reached', on: todayIso() }, `You reached ${goal.name}. Well done! It is kept under Reached and paused.${handover}`)
      }
    >
      Mark as reached
    </Button>
  )

  const edit =
    onEdit === null ? null : (
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit goal
      </Button>
    )
  const remove = (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRemoving((open) => !open)}>
      <Icon name="trash" /> Remove
    </Button>
  )
  // F45: only a goal with nothing saved goes; one holding money says why not.
  const removal = !removing ? null : progress === undefined || !progress.empty ? (
    <p role="alert" className="rounded-lg border px-3 py-2 text-sm">
      {goal.name} holds {formatCents(saved.balanceCents)}, so removing it would lose the record of that balance. Pause it or mark it
      reached instead. If that money is gone, edit the goal to say nothing is saved, then remove it.
    </p>
  ) : (
    <div className="space-y-2 rounded-lg border px-3 py-2 text-sm">
      <p>
        Remove {goal.name}?{onFund ? ' Its fund stays on your Savings list, with everything filed under it.' : ''}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={busy}
          onClick={() =>
            void write(
              () => removeGoal(supabase, goal.id),
              `Removed ${goal.name}.${onFund ? ' Its fund stays on your Savings list; remove it in Setup if you no longer need it.' : ''}`,
            )
          }
        >
          Remove goal
        </Button>
        <Button variant="outline" size="sm" onClick={() => setRemoving(false)}>
          Keep it
        </Button>
      </div>
    </div>
  )
  // Editing and placing on the first line, pausing, finishing and removing
  // on the second, so each line reads as one kind of thing at 320px too.
  const rows = (first: ReactNode, second: ReactNode = null) => (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {first}
        {second === null ? remove : null}
      </div>
      {second === null ? null : (
        <div className="flex flex-wrap items-center gap-2">
          {second}
          {remove}
        </div>
      )}
      {removal}
    </div>
  )
  if (!goalsOrdered) return rows(edit)
  if (goal.status !== 'active') {
    return rows(
      <>
        {edit}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void state({ status: 'active', ...goalAtEnd({ goals: goals.map(placedGoal) }) }, `${goal.name} is back among your goals, at the end.`)
          }
        >
          Resume
        </Button>
        {goal.status === 'paused' ? reach : null}
      </>,
    )
  }
  return rows(
    <>
      {edit}
      {mainGoal?.id === goal.id ? null : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void place('first', `${goal.name} is now your main goal. The Coach and the Week show it.`)}
        >
          Make main goal
        </Button>
      )}
      {active.length < 2 ? null : (
        <span className="ml-auto flex">
          <Button variant="ghost" size="icon" aria-label={`Move ${goal.name} up`} disabled={busy || at <= 0} onClick={() => void place('up', null)}>
            <Icon name="up" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${goal.name} down`}
            disabled={busy || at === active.length - 1}
            onClick={() => void place('down', null)}
          >
            <Icon name="down" />
          </Button>
        </span>
      )}
    </>,
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          void state({ status: 'paused' }, `${goal.name} is paused. Money moved into its fund still counts; resume it under Reached and paused.${handover}`)
        }
      >
        Pause
      </Button>
      {reach}
    </>,
  )
}
