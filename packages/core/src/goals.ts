/**
 * Savings goals, plural: their order, which one leads, and where a goal goes
 * when it is moved, made main, added or resumed (formula decision F45, plan
 * slice G1).
 *
 * NOT workbook-derived. The workbook's Savings tab gives each fund a card in
 * its list's order, and no goal leads (D28). The owner asked on 2026-09-24
 * for goals besides flight training, so the Coach and the Week need to know
 * which goal to show: the main goal, the first active one in the owner's
 * order.
 *
 * Every function takes the whole list, so the Coach's digest and the
 * forecasts can speak of every goal and not only one. No money passes
 * through this file; the screens ask here and write only what comes back.
 */
import { endOfList, moveInList } from './list-order.js'

/** Active goals lead and are listed; paused and reached ones are kept, folded away (F45). */
export type GoalStatus = 'active' | 'paused' | 'reached'

export interface PlacedGoal {
  readonly id: string
  /** Its place in the owner's order (0015's sort_order). Every goal from before 0015 is at 0. */
  readonly sortOrder: number
  readonly status: GoalStatus
  /**
   * When it was made, as the database writes it (0004's created_at), which
   * breaks a tie in place. Compared as text: the database writes every one
   * in the same form and offset, so text order is time order.
   */
  readonly createdAt: string
}

export interface OrderGoalsInput<G extends PlacedGoal> {
  readonly goals: readonly G[]
}

export interface OrderedGoals<G extends PlacedGoal> {
  /** The active goals in the owner's order; the first is the main goal. */
  readonly active: readonly G[]
  readonly paused: readonly G[]
  readonly reached: readonly G[]
  /** The first active goal: the one the Coach and the Week show. Null when none is active. */
  readonly main: G | null
}

/**
 * Every goal in the owner's order: by place, then when it was made, then by
 * id, so the order never depends on how the rows arrived. Goals sharing a
 * place, as every goal from before 0015 does, keep the order they were made
 * in, so the main goal is then the oldest: the one the app showed before.
 */
export function orderGoals<G extends PlacedGoal>(input: OrderGoalsInput<G>): OrderedGoals<G> {
  const sorted = [...input.goals].sort(
    (a, b) => a.sortOrder - b.sortOrder || byText(a.createdAt, b.createdAt) || byText(a.id, b.id),
  )
  const active = sorted.filter((g) => g.status === 'active')
  return {
    active,
    paused: sorted.filter((g) => g.status === 'paused'),
    reached: sorted.filter((g) => g.status === 'reached'),
    main: active[0] ?? null,
  }
}

/** Plain code-unit order, the same on every device, unlike a locale's. */
function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export interface MoveGoalInput {
  readonly goals: readonly PlacedGoal[]
  readonly id: string
  /** One place up or down among the active goals, or first among them: the main goal. */
  readonly to: 'up' | 'down' | 'first'
}

export interface MoveGoalOutput {
  /** Only the goals whose place must be written. Empty when nothing moves. */
  readonly changes: readonly { readonly id: string; readonly sortOrder: number }[]
}

/**
 * Move a goal among the active goals, as Setup moves a row in a list: the
 * active goals are numbered 0, 1, 2… in their new order, and only the places
 * that differ come back. Paused and reached goals keep theirs. A goal that
 * is not active does not move.
 */
export function moveGoal(input: MoveGoalInput): MoveGoalOutput {
  const rows = orderGoals({ goals: input.goals }).active.map((g) => ({ id: g.id, sortOrder: g.sortOrder }))
  if (input.to !== 'first') return moveInList({ rows, id: input.id, direction: input.to })
  const moving = rows.find((row) => row.id === input.id)
  if (moving === undefined) return { changes: [] }
  const order = [moving, ...rows.filter((row) => row.id !== input.id)]
  return {
    changes: order
      .map((row, place) => ({ id: row.id, sortOrder: place, was: row.sortOrder }))
      .filter((row) => row.sortOrder !== row.was)
      .map(({ id, sortOrder }) => ({ id, sortOrder })),
  }
}

export interface GoalAtEndInput {
  readonly goals: readonly PlacedGoal[]
}

/**
 * The place for a goal added, or resumed from paused or reached: after every
 * goal, paused and reached ones included, so it never lands on a place
 * another holds and never becomes the main goal by itself.
 */
export function goalAtEnd(input: GoalAtEndInput): { readonly sortOrder: number } {
  return endOfList({ sortOrders: input.goals.map((g) => g.sortOrder) })
}
