import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { expectedPay, type ExpectedPayInput } from '../src/index.js'

/** Suite tests, worked by hand from F29 (docs/formula-decisions.md). */

const d = isoDate
const PAY = 'c-pay'
const SIDE = 'c-side'
const received = (postedOn: string, dollars: number, categoryId = PAY) => ({ postedOn: d(postedOn), amountCents: dollars * 100, categoryId })

/** F29's worked example: Thursday 24 September 2026, Pay bi-weekly from 5 June. */
const base: ExpectedPayInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-06-01'),
  categories: [
    { id: PAY, name: 'Pay', kind: 'income', sortOrder: 0 },
    { id: SIDE, name: 'Side work', kind: 'income', sortOrder: 1 },
  ],
  entries: [
    received('2026-07-31', 1_990),
    received('2026-08-14', 2_080),
    received('2026-08-28', 2_150),
    received('2026-09-11', 2_100),
    received('2026-08-20', 150, SIDE),
  ],
  paySchedules: [{ categoryId: PAY, firstPayDate: d('2026-06-05'), frequency: 'biweekly' }],
  budgetHistory: [],
}

describe('expectedPay (F29)', () => {
  it('counts each payday left this month at the median of the last three receipts', () => {
    // Paydays 11 and 25 September; only the 25th is after asOf. Latest three:
    // 2,100.00, 2,150.00, 2,080.00; the median is 2,100.00. Side work paid
    // once but has neither a schedule nor a goal, so it is named, not counted as $0.
    expect(expectedPay(base)).toEqual({
      dueCents: 210_000,
      notCounted: [SIDE],
      sources: [
        { categoryId: PAY, basis: 'usual', paydays: ['2026-09-25'], perPaydayCents: 210_000, dueCents: 210_000 },
        { categoryId: SIDE, basis: 'not_counted', paydays: [], perPaydayCents: null, dueCents: null },
      ],
    })
  })

  it('says nothing of an Income row that has never paid and has no schedule or goal', () => {
    // A starter list's spare row, such as Donations, is not pay left out.
    const pay = expectedPay({ ...base, entries: base.entries.filter((e) => e.categoryId !== SIDE) })
    expect(pay.notCounted).toEqual([])
    expect(pay.sources[1]).toEqual({ categoryId: SIDE, basis: 'idle', paydays: [], perPaydayCents: null, dueCents: null })
  })

  it("shares the month's goal across a pay period when nothing has been received yet", () => {
    // $4,550.00 × 12 ÷ 26 = $2,100.00 a payday (F15's payShare).
    const pay = expectedPay({
      ...base,
      categories: [base.categories[0]!],
      entries: [],
      budgetHistory: [{ categoryId: PAY, month: d('2026-09-01'), applies: 'onward', budgetCents: 455_000 }],
    })
    expect(pay.sources).toEqual([{ categoryId: PAY, basis: 'goal_share', paydays: ['2026-09-25'], perPaydayCents: 210_000, dueCents: 210_000 }])
    expect(pay.notCounted).toEqual([])
  })

  it('counts a receipt before the records start, or after today, as no receipt', () => {
    const pay = expectedPay({ ...base, historyStart: d('2026-09-12'), entries: [...base.entries, received('2026-09-30', 9_000)] })
    expect(pay.sources[0]).toMatchObject({ basis: 'not_counted', dueCents: null })
  })

  it('takes the goal less what came in for a source with a goal and no schedule', () => {
    // $4,550.00 − $2,100.00 received this month; a month over its goal brings nothing more.
    const goal = (cents: number) => [{ categoryId: PAY, month: d('2026-09-01'), applies: 'onward' as const, budgetCents: cents }]
    const noSchedule = { ...base, categories: [base.categories[0]!], paySchedules: [] }
    expect(expectedPay({ ...noSchedule, budgetHistory: goal(455_000) }).sources).toEqual([
      { categoryId: PAY, basis: 'goal_left', paydays: [], perPaydayCents: null, dueCents: 245_000 },
    ])
    expect(expectedPay({ ...noSchedule, budgetHistory: goal(200_000) }).dueCents).toBe(0)
  })

  it('uses the one or two receipts there are, and the latest three when a day has two', () => {
    // One: $2,100.00. Two: ($2,150.00 + $2,100.00) ÷ 2 = $2,125.00. Two
    // deposits on each of 28 August and 11 September: the latest three are
    // $2,100.00, $2,000.00 and, the larger first on the 28th, $2,150.00, so
    // the median is $2,100.00; taking the $40.00 instead would give $2,000.00.
    const only = (...rows: ReturnType<typeof received>[]) => expectedPay({ ...base, entries: rows }).sources[0]?.perPaydayCents
    expect(only(received('2026-09-11', 2_100))).toBe(210_000)
    expect(only(received('2026-08-28', 2_150), received('2026-09-11', 2_100))).toBe(212_500)
    const split = [received('2026-08-28', 40), received('2026-08-28', 2_150), received('2026-09-11', 2_000), received('2026-09-11', 2_100)]
    expect(only(...split)).toBe(210_000)
  })

  it('pays a monthly source on its day, or a short month’s last day, and none before its first payday', () => {
    // A goal from January, so a month with no receipt is still counted.
    const goal = [{ categoryId: PAY, month: d('2026-01-01'), applies: 'onward' as const, budgetCents: 455_000 }]
    const monthly = (firstPayDate: string, asOf: string) =>
      expectedPay({ ...base, asOf: d(asOf), budgetHistory: goal, paySchedules: [{ categoryId: PAY, firstPayDate: d(firstPayDate), frequency: 'monthly' }] })
        .sources[0]?.paydays
    expect(monthly('2026-01-31', '2026-02-10')).toEqual(['2026-02-28'])
    expect(monthly('2026-01-31', '2026-02-28')).toEqual([])
    expect(monthly('2026-09-30', '2026-09-01')).toEqual(['2026-09-30'])
    expect(monthly('2026-10-15', '2026-09-01')).toEqual([])
    // Weekly from 4 September: the 25th is the only one after the 24th.
    const weekly = expectedPay({ ...base, paySchedules: [{ categoryId: PAY, firstPayDate: d('2026-09-04'), frequency: 'weekly' }] })
    expect(weekly.sources[0]).toMatchObject({ paydays: ['2026-09-25'], dueCents: 210_000 })
  })

  it('pays nobody from a schedule left on a category moved off Income (N27)', () => {
    const moved = expectedPay({ ...base, categories: [{ id: PAY, name: 'Pay', kind: 'savings', sortOrder: 0 }], entries: [] })
    expect(moved).toEqual({ dueCents: 0, notCounted: [], sources: [] })
  })
})
