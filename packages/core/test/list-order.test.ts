import { describe, expect, it } from 'vitest'
import { appendToLists, endOfList, moveInList } from '../src/list-order.js'

describe('endOfList', () => {
  it('starts an empty list at 0', () => {
    expect(endOfList({ sortOrders: [] })).toEqual({ sortOrder: 0 })
  })

  // After rows move out a list has gaps, so its length is not its end: a
  // fourth row given 3 here would sort between the second and the third.
  it('goes after the highest position, not at the count', () => {
    expect(endOfList({ sortOrders: [0, 5, 2] })).toEqual({ sortOrder: 6 })
  })

  // Every category made before 0005 has position 0, so a new one lands after
  // all of them rather than among them.
  it('goes after rows that all share one position', () => {
    expect(endOfList({ sortOrders: [0, 0, 0] })).toEqual({ sortOrder: 1 })
  })
})

const rows = (...pairs: [string, number][]) => pairs.map(([id, sortOrder]) => ({ id, sortOrder }))

describe('moveInList', () => {
  it('swaps a row with the one above, numbering the list from 0', () => {
    const { changes } = moveInList({ rows: rows(['a', 0], ['b', 1], ['c', 2]), id: 'c', direction: 'up' })
    expect(changes).toEqual([
      { id: 'c', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ])
  })

  it('swaps a row with the one below', () => {
    const { changes } = moveInList({ rows: rows(['a', 0], ['b', 1], ['c', 2]), id: 'a', direction: 'down' })
    expect(changes).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ])
  })

  // Rows sharing a position are ordered by name alone. Swapping two of them
  // without renumbering would change nothing on screen, so the whole list is
  // numbered in its shown order and every row whose position differs is written.
  it('numbers rows that share a position, so the move shows', () => {
    const { changes } = moveInList({ rows: rows(['a', 0], ['b', 0], ['c', 0]), id: 'b', direction: 'up' })
    // b keeps the 0 it has, so it is not written.
    expect(changes).toEqual([
      { id: 'a', sortOrder: 1 },
      { id: 'c', sortOrder: 2 },
    ])
  })

  it('changes nothing at either end, or for a row not in the list', () => {
    const list = rows(['a', 0], ['b', 1])
    expect(moveInList({ rows: list, id: 'a', direction: 'up' }).changes).toEqual([])
    expect(moveInList({ rows: list, id: 'b', direction: 'down' }).changes).toEqual([])
    expect(moveInList({ rows: list, id: 'z', direction: 'up' }).changes).toEqual([])
  })
})

describe('appendToLists', () => {
  const row = (name: string, kind: string, sortOrder: number) => ({ name, kind, sortOrder })

  // Each list continues after its own highest position, in the order asked.
  it('adds each row to the bottom of its own list, in order', () => {
    const { rows } = appendToLists({
      existing: [row('Pay', 'income', 0), row('Rent', 'bill', 4)],
      wanted: [
        { name: 'Income 1', kind: 'income' },
        { name: 'Phone', kind: 'bill' },
        { name: 'Income 2', kind: 'income' },
        { name: 'Netflix', kind: 'subscription' },
      ],
    })
    expect(rows).toEqual([
      row('Income 1', 'income', 1),
      row('Phone', 'bill', 5),
      row('Income 2', 'income', 2),
      row('Netflix', 'subscription', 0),
    ])
  })

  // Whatever list it is on: a name lives on one list only (D11), and the
  // database would refuse the second. " rent " is the same name to a person.
  it('skips a name already there, on any list and in any case', () => {
    const { rows } = appendToLists({
      existing: [row('Rent', 'variable', 0)],
      wanted: [
        { name: ' rent ', kind: 'bill' },
        { name: 'Phone', kind: 'bill' },
      ],
    })
    expect(rows).toEqual([row('Phone', 'bill', 0)])
  })

  // The goal's name can be one of the workbook's own; it is added once.
  it('adds a name asked for twice only once', () => {
    const { rows } = appendToLists({
      existing: [],
      wanted: [
        { name: 'Travel Fund', kind: 'savings' },
        { name: 'Travel Fund', kind: 'savings' },
      ],
    })
    expect(rows).toEqual([row('Travel Fund', 'savings', 0)])
  })

  // What makes a second press harmless: everything is already there.
  it('adds nothing when every name exists', () => {
    const existing = [row('Rent', 'bill', 0), row('Phone', 'bill', 1)]
    expect(appendToLists({ existing, wanted: existing }).rows).toEqual([])
  })
})
