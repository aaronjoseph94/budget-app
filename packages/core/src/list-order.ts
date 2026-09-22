/**
 * Where a row sits in one of Workbook's lists.
 *
 * `categories.sort_order` is Workbook's row order on START HERE (migration
 * 0005), and the app sorts each list by it, then by name. Working out a new
 * position is a small sum, and invariant 1 keeps every sum out of the UI, so
 * the screens ask here and only write what comes back. No money passes
 * through this file.
 */

export interface EndOfListInput {
  /** The positions of the rows already on the list, in any order. */
  readonly sortOrders: readonly number[]
}

export interface EndOfListOutput {
  readonly sortOrder: number
}

/**
 * The position for a row added to the bottom of a list, as Workbook fills the
 * next empty slot. After the highest position rather than at the count,
 * because a list loses rows to other lists and keeps the gaps.
 */
export function endOfList(input: EndOfListInput): EndOfListOutput {
  if (input.sortOrders.length === 0) return { sortOrder: 0 }
  return { sortOrder: Math.max(...input.sortOrders) + 1 }
}

export interface ListRow {
  readonly id: string
  readonly sortOrder: number
}

export interface MoveInListInput {
  /** The whole list, in the order it is shown. */
  readonly rows: readonly ListRow[]
  readonly id: string
  readonly direction: 'up' | 'down'
}

export interface MoveInListOutput {
  /** Only the rows whose position must be written. Empty when nothing moves. */
  readonly changes: readonly ListRow[]
}

/**
 * Swap a row with its neighbour.
 *
 * The list is numbered 0, 1, 2… in its new order, and only the rows whose
 * number differs from what is stored come back. Rows made before lists
 * existed all share position 0 and are ordered by name alone, so swapping
 * two positions that are both 0 would change nothing on screen.
 */
export function moveInList(input: MoveInListInput): MoveInListOutput {
  const from = input.rows.findIndex((row) => row.id === input.id)
  const to = input.direction === 'up' ? from - 1 : from + 1
  const moved = input.rows[from]
  const neighbour = input.rows[to]
  if (from === -1 || moved === undefined || neighbour === undefined) return { changes: [] }

  const order = [...input.rows]
  order[to] = moved
  order[from] = neighbour
  const changes = order
    .map((row, index) => ({ id: row.id, sortOrder: index, was: row.sortOrder }))
    .filter((row) => row.sortOrder !== row.was)
    .map(({ id, sortOrder }) => ({ id, sortOrder }))
  return { changes }
}
