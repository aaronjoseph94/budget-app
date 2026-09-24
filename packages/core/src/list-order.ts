/**
 * Where a row sits in one of the workbook's lists.
 *
 * `categories.sort_order` is the workbook's row order on START HERE (migration
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
 * The position for a row added to the bottom of a list, as the workbook fills the
 * next empty slot. After the highest position rather than at the count,
 * because a list loses rows to other lists and keeps the gaps.
 */
export function endOfList(input: EndOfListInput): EndOfListOutput {
  if (input.sortOrders.length === 0) return { sortOrder: 0 }
  return { sortOrder: Math.max(...input.sortOrders) + 1 }
}

export interface AppendToListsInput<K extends string> {
  /** Every row already stored, on every list. */
  readonly existing: readonly { readonly name: string; readonly kind: K; readonly sortOrder: number }[]
  /** The rows to add, in the order each list should show them. */
  readonly wanted: readonly { readonly name: string; readonly kind: K }[]
}

export interface AppendToListsOutput<K extends string> {
  /** Only the rows to write, each with its position. Empty when all exist. */
  readonly rows: readonly { readonly name: string; readonly kind: K; readonly sortOrder: number }[]
}

/**
 * Many rows at once, each to the bottom of its own list, as endOfList places
 * one. A name already stored, on any list, is left out: a name lives on one
 * list only (D11), and leaving it out is what makes adding the same set twice
 * add nothing the second time. Names compare trimmed and case-blind, because
 * "rent" beside "Rent" reads to a person as the same category twice.
 */
export function appendToLists<K extends string>(input: AppendToListsInput<K>): AppendToListsOutput<K> {
  const key = (name: string) => name.trim().toLowerCase()
  const taken = new Set(input.existing.map((row) => key(row.name)))
  const next = new Map<K, number>()
  const rows: { name: string; kind: K; sortOrder: number }[] = []
  for (const want of input.wanted) {
    if (taken.has(key(want.name))) continue
    taken.add(key(want.name))
    // The first new row on a list goes after what is stored; each one after
    // it goes after the row added before it.
    const following = next.get(want.kind)
    const sortOrder =
      following !== undefined
        ? following
        : endOfList({ sortOrders: input.existing.filter((row) => row.kind === want.kind).map((row) => row.sortOrder) }).sortOrder
    rows.push({ name: want.name, kind: want.kind, sortOrder })
    next.set(want.kind, sortOrder + 1)
  }
  return { rows }
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
