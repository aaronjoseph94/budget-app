import { isoDate } from '@budget/money-primitives'
import type { MonthForecastInput } from '../src/index.js'

/**
 * The running example of F29 to F32 (docs/formula-decisions.md): Thursday
 * 24 September 2026, records from 1 June. Signs as the ledger keeps them
 * (D3): money in above zero, spending and moves into savings below.
 */
export const d = isoDate
export const PAY = 'c-pay'
export const RENT = 'c-rent'
export const PHONE = 'c-phone'
export const NET = 'c-internet'
export const DINING = 'c-dining'
export const FLIGHT = 'c-flight'

const row = (postedOn: string, dollars: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents: Math.round(dollars * 100), categoryId })

export const example: MonthForecastInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-06-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: PAY, name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: RENT, name: 'Rent', kind: 'bill', sortOrder: 0 },
    { id: PHONE, name: 'Phone', kind: 'bill', sortOrder: 1 },
    { id: NET, name: 'Internet', kind: 'bill', sortOrder: 2 },
    { id: DINING, name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: FLIGHT, name: 'Flight fund', kind: 'savings', sortOrder: 0 },
  ],
  entries: [
    row('2026-07-31', 1_990, PAY),
    row('2026-08-14', 2_080, PAY),
    row('2026-08-28', 2_150, PAY),
    row('2026-09-11', 2_100, PAY),
    row('2026-06-10', -900, DINING),
    row('2026-07-10', -1_240, DINING),
    row('2026-08-10', -1_054, DINING),
    row('2026-09-10', -840, DINING),
    row('2026-09-01', -1_200, RENT),
    row('2026-09-15', -300, FLIGHT),
  ],
  budgetHistory: [{ categoryId: FLIGHT, month: d('2026-06-01'), applies: 'onward', budgetCents: 50_000 }],
  planHistory: [
    { categoryId: RENT, effectiveMonth: d('2026-06-01'), plannedCents: 120_000, dueDay: 1 },
    { categoryId: PHONE, effectiveMonth: d('2026-06-01'), plannedCents: 6_000, dueDay: 28 },
    { categoryId: NET, effectiveMonth: d('2026-06-01'), plannedCents: 8_000, dueDay: 20 },
  ],
  paySchedules: [{ categoryId: PAY, firstPayDate: d('2026-06-05'), frequency: 'biweekly' }],
  startingBalanceCents: 200_000,
}

/** The example on an earlier day, with only the rows dated by then. */
export function on(asOf: string, over: Partial<MonthForecastInput> = {}): MonthForecastInput {
  return { ...example, ...over, asOf: d(asOf), entries: (over.entries ?? example.entries).filter((e) => e.postedOn <= asOf) }
}
