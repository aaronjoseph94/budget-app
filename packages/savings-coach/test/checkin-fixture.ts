import { type CheckinInput, impulseShare, isoDate, suggestedWeeklyLimit, weeklyRecap } from '@budget/core'
import type { PayloadGoal } from '../src/index.js'

const d = isoDate
let n = 0
const row = (date: string, cents: number, categoryId: string) => ({ id: `t${++n}`, postedOn: d(date), amountCents: cents, categoryId })

/**
 * core's check-in example (F42): Sunday 27 September 2026, records from 1
 * February. $226.09 of everyday spending, $16.09 over the weekly budgets
 * and $23.91 less than the week before; Dining out cost most, with a usual
 * month of $300.00, so its limit is $65.00.
 */
export const CHECKIN: CheckinInput = {
  asOf: d('2026-09-27'),
  historyStart: d('2026-02-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 1, weeklyBudgetCents: 7_000 },
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 2, weeklyBudgetCents: 14_000 },
    { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 3, weeklyBudgetCents: null },
  ],
  entries: [
    row('2026-09-22', -450, 'coffee'),
    row('2026-09-23', -8_420, 'dining'),
    row('2026-09-24', -11_240, 'groceries'),
    row('2026-09-25', -1_999, 'coffee'),
    row('2026-09-26', -2_000, 'dining'),
    row('2026-09-26', 1_500, 'groceries'),
    row('2026-09-15', -25_000, 'groceries'),
    ...['03', '04', '05', '06', '07', '08'].map((m) => row(`2026-${m}-10`, -30_000, 'dining')),
  ],
}

export const nameOf = (id: string) => CHECKIN.categories.find((c) => c.id === id)?.name ?? id

export const GOALS: readonly PayloadGoal[] = [
  { id: 'flight', name: 'Flight training', main: true, hasHours: true },
  { id: 'travel', name: 'Travel', main: false, hasHours: false },
]

/** The example's three engine results, with the answers given. */
export function checkinOf(input: CheckinInput = CHECKIN, answers: Parameters<typeof impulseShare>[0]['answers'] = []) {
  return { recap: weeklyRecap(input), limit: suggestedWeeklyLimit(input), impulse: impulseShare({ asOf: input.asOf, answers }) }
}
