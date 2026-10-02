import { afterEach, describe, expect, it, vi } from 'vitest'
import { paySources } from '../src/rows.js'

afterEach(() => {
  vi.restoreAllMocks()
})

const income = (id: string, name: string) => ({ id, name, kind: 'income', sort_order: 0, weekly_budget_cents: null })
const schedule = (id: string) => ({ category_id: id, first_pay_date: '2026-09-04', frequency: 'biweekly' })

describe('paySources (architecture-a-02)', () => {
  it('puts sources tied on Setup’s order in English order, whatever the server’s own locale says', () => {
    // A server locale that reads names backwards: a bare localeCompare would follow it.
    vi.spyOn(String.prototype, 'localeCompare').mockImplementation(function (this: string, other: string) {
      return this < other ? 1 : this > other ? -1 : 0
    })
    const read = {
      categories: [income('z', 'Zoo'), income('a', 'Ärenden'), income('b', 'apple')],
      schedules: [schedule('z'), schedule('a'), schedule('b')],
    }
    expect(paySources(read).map((s) => s.name)).toEqual(['apple', 'Ärenden', 'Zoo'])
  })
})
