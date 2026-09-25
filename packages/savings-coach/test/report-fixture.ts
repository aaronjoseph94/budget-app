import { type MonthReportInput, isoDate, monthReport } from '@budget/core'
import type { ReviewedMonth } from '../src/index.js'

const d = isoDate
const row = (postedOn: string, amountCents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents, categoryId })
const MONTHS = ['02', '03', '04', '05', '06', '07', '08']
const monthly = (categoryId: string, day: string, dollars: readonly number[]) =>
  dollars.map((amount, i) => row(`2026-${MONTHS[i]!}-${day}`, amount * 100, categoryId))

/**
 * core's month-report example (F36): Thursday 24 September 2026, records
 * from 1 February. August is complete, with Dining out $155.00 over its
 * usual month and Groceries $80.00 under; September is so far.
 */
const BASE: MonthReportInput = {
  asOf: d('2026-09-24'),
  month: d('2026-08-01'),
  historyStart: d('2026-02-01'),
  readFrom: d('2026-02-01'),
  categories: [
    { id: 'pay', name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0 },
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 1 },
    { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 0 },
  ],
  planHistory: [{ categoryId: 'rent', effectiveMonth: d('2026-02-01'), plannedCents: 120_000, dueDay: 1 }],
  entries: [
    ...monthly('pay', '05', [4_200, 4_200, 4_200, 4_200, 4_200, 4_200, 4_200]),
    ...monthly('dining', '10', [-300, -420, -360, -510, -390, -450, -560]),
    ...monthly('groceries', '26', [-380, -380, -380, -380, -380, -380, -300]),
    ...monthly('fund', '15', [-300, -300, -300, -300, -300, -300, -500]),
    row('2026-09-05', 420_000, 'pay'),
    row('2026-09-10', -20_000, 'dining'),
  ],
}

function reviewed(over: Partial<MonthReportInput>): ReviewedMonth {
  const report = monthReport({ ...BASE, ...over })
  if (!('totals' in report)) throw new Error(report.status)
  return report
}

export const AUGUST = reviewed({})
export const SEPTEMBER = reviewed({ month: d('2026-09-01') })
/** August again, with the records starting on the 8th: nothing to compare, no movers. */
export const PARTLY = reviewed({ historyStart: d('2026-08-08') })
/** August with only Dining out's rise. */
export const RISE_ONLY = reviewed({ entries: BASE.entries.filter((e) => !(e.categoryId === 'groceries' && e.postedOn === '2026-08-26')).concat(row('2026-08-26', -38_000, 'groceries')) })

const NAMES: Readonly<Record<string, string>> = { dining: 'Dining out', groceries: 'Groceries' }
export const nameOf = (id: string) => NAMES[id] ?? 'a category'
