import { describe, expect, it } from 'vitest'
import { cashFlowAhead } from '../src/index.js'
import { DINING, PAY, RENT, d, example } from './forecast-example.js'

/** Suite tests, worked by hand from F35 (docs/formula-decisions.md). */

const SIDE = 'c-side'
const GIFTS = 'c-gifts'
const SPARE = 'c-spare'

// Rent goes up to $1,300.00 from November, the second month ahead (D13).
const rentRise = { ...example, planHistory: [...example.planHistory, { categoryId: RENT, effectiveMonth: d('2026-11-01'), plannedCents: 130_000, dueDay: 1 }] }

describe('cashFlowAhead (F35)', () => {
  it('works out three months from pay, the plans in effect, a spread of spending and savings, chained from the month’s end', () => {
    // Pay: two paydays a month × 2,100.00. Bills 1,340.00, then 1,440.00 from
    // November. Variable: 900.00, 1,054.00 (1,050) and 1,240.00. October's net
    // 4,200.00 − 1,340.00 − 500.00 − 1,054.00 = 1,306.00; from F30's 3,310:
    // 4,616.00, worst 4,430.00, best 4,770.00. November's net 1,206.00.
    const ahead = cashFlowAhead(rentRise)
    expect(ahead).toMatchObject({ status: 'range', checkBackOn: null, completeMonths: 3, evidence: 'some', payNotCounted: [] })
    expect(ahead.months).toEqual([
      {
        month: '2026-10-01',
        payCents: 420_000,
        billsCents: 134_000,
        savingsCents: 50_000,
        variable: { low: 90_000, mid: 105_000, high: 124_000 },
        net: { low: 112_000, mid: 131_000, high: 146_000 },
        balance: { low: 443_000, mid: 462_000, high: 477_000 },
      },
      {
        month: '2026-11-01',
        payCents: 420_000,
        billsCents: 144_000,
        savingsCents: 50_000,
        variable: { low: 90_000, mid: 105_000, high: 124_000 },
        net: { low: 102_000, mid: 121_000, high: 136_000 },
        balance: { low: 545_000, mid: 582_000, high: 613_000 },
      },
      {
        month: '2026-12-01',
        payCents: 420_000,
        billsCents: 144_000,
        savingsCents: 50_000,
        variable: { low: 90_000, mid: 105_000, high: 124_000 },
        net: { low: 102_000, mid: 121_000, high: 136_000 },
        balance: { low: 647_000, mid: 703_000, high: 749_000 },
      },
    ])
  })

  it('takes the median only, rough, with under three complete months', () => {
    // August alone: 1,054.00 each way; F30's end is 3,310 (rough), so October
    // ends 3,310.00 + 1,306.00 = 4,616.00, 4,620 every way.
    const ahead = cashFlowAhead({ ...example, historyStart: d('2026-08-01') })
    expect(ahead).toMatchObject({ status: 'rough', completeMonths: 1, evidence: 'thin' })
    expect(ahead.months[0]).toMatchObject({
      variable: { low: 105_000, mid: 105_000, high: 105_000 },
      net: { low: 131_000, mid: 131_000, high: 131_000 },
      balance: { low: 462_000, mid: 462_000, high: 462_000 },
    })
  })

  it('says when it becomes possible with no complete month', () => {
    // Records from 12 September: October is the first whole month, complete on 1 November.
    expect(cashFlowAhead({ ...example, historyStart: d('2026-09-12') })).toMatchObject({ status: 'too_early', checkBackOn: '2026-11-01', months: [] })
  })

  it('shows the nets and no balance without a typed start (D17)', () => {
    const ahead = cashFlowAhead({ ...example, startingBalanceCents: null })
    expect(ahead.months.map((m) => [m.net.mid, m.balance])).toEqual([
      [131_000, null],
      [131_000, null],
      [131_000, null],
    ])
  })

  it('counts a goal with no schedule whole, names pay it cannot count, and passes over a spare row', () => {
    // Side: no schedule, a $300.00 goal from October. Gifts: a receipt, no
    // schedule, no goal. Spare: never paid, nothing typed.
    const ahead = cashFlowAhead({
      ...example,
      categories: [
        ...example.categories,
        { id: SIDE, name: 'Side', kind: 'income', sortOrder: 1 },
        { id: GIFTS, name: 'Gifts', kind: 'income', sortOrder: 2 },
        { id: SPARE, name: 'Spare', kind: 'income', sortOrder: 3 },
      ],
      entries: [...example.entries, { postedOn: d('2026-09-02'), amountCents: 5_000, categoryId: GIFTS }],
      budgetHistory: [...example.budgetHistory, { categoryId: SIDE, month: d('2026-10-01'), applies: 'onward', budgetCents: 30_000 }],
    })
    expect(ahead.payNotCounted).toEqual([GIFTS])
    expect(ahead.months.map((m) => m.payCents)).toEqual([450_000, 450_000, 450_000])
  })

  it('counts a scheduled source with no receipt at its whole goal, and a month of refunds as nothing spent', () => {
    // Pay's receipts all before the records; its $4,550.00 goal counts whole.
    // Dining: June a $300.00 refund (counted $0.00), July 1,240.00, August 1,054.00.
    const entries = example.entries
      .filter((e) => e.categoryId !== PAY && !(e.categoryId === DINING && e.postedOn === '2026-06-10'))
      .concat([{ postedOn: d('2026-06-12'), amountCents: 30_000, categoryId: DINING }])
    const ahead = cashFlowAhead({
      ...example,
      entries,
      budgetHistory: [...example.budgetHistory, { categoryId: PAY, month: d('2026-06-01'), applies: 'onward', budgetCents: 455_000 }],
    })
    expect(ahead.months[0]).toMatchObject({ payCents: 455_000, variable: { low: 0, mid: 105_000, high: 124_000 } })
  })
})
