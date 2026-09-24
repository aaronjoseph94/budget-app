import { useState } from 'react'
import { moveGoal } from '@budget/core'
import { placedGoal, useAppData } from '../app-data.js'
import { setGoalPlaces, type ListedGoalRow } from '../ledger.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'

export interface Notice {
  readonly ok: boolean
  readonly text: string
}

/**
 * What can be done with one goal on Savings (F45): edit it, make it the main
 * goal, and move it up or down among the active goals. Every place comes
 * from core (moveGoal); this writes what comes back and reloads. Before 0015
 * only Edit is offered, and the screen says once, above the goals, why the
 * rest wait.
 */
export function GoalActions({
  goal,
  onEdit,
  onNotice,
}: {
  goal: ListedGoalRow
  /** Null where this goal cannot be edited here. */
  onEdit: (() => void) | null
  onNotice: (notice: Notice) => void
}) {
  const { supabase, goals, mainGoal, goalsOrdered, refresh } = useAppData()
  const [busy, setBusy] = useState(false)
  const active = goals.filter((g) => g.status === 'active')
  const at = active.findIndex((g) => g.id === goal.id)

  const place = async (to: 'up' | 'down' | 'first', done: string | null) => {
    setBusy(true)
    try {
      await setGoalPlaces(supabase, moveGoal({ goals: goals.map(placedGoal), id: goal.id, to }).changes)
      if (done !== null) onNotice({ ok: true, text: done })
    } catch (cause) {
      onNotice({ ok: false, text: cause instanceof Error ? cause.message : 'Could not move that goal. Nothing was saved.' })
    }
    // What is stored now, moved or not.
    await refresh()
    setBusy(false)
  }

  const edit =
    onEdit === null ? null : (
      <Button variant="outline" size="sm" onClick={onEdit}>
        Edit goal
      </Button>
    )
  if (!goalsOrdered || goal.status !== 'active') return edit
  return (
    <div className="flex flex-wrap items-center gap-2">
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
    </div>
  )
}
