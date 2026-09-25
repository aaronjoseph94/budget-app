import { describe, expect, it } from 'vitest'
import { cashFlow30 } from '../src/index.js'
import { NET, PAY, PHONE, RENT, d, example } from './forecast-example.js'

/** Suite tests, worked by hand from F32 (docs/formula-decisions.md). */

const GYM = 'c-gym'
const PARKING = 'c-parking'

describe('cashFlow30 (F32)', () => {
  it('walks 30 days from today’s real balance, with each payday, each bill and a daily amount', () => {
    // Today: 2,000.00 + 2,100.00 − (1,200.00 + 840.00) − 300.00 = 1,760.00.
    // Daily: 3,134.00 over the 90 days from 27 June, 34.82. 25 Sep: +2,100.00
    // pay, −80.00 Internet (due the 20th, not seen yet), −34.82: 3,745.18.
    // 1 Oct: −1,200.00 Rent, 2,276.26; the tightest, 8 Oct: 2,032.52.
    const flow = cashFlow30(example)
    expect(flow).toMatchObject({
      status: 'line',
      todayCents: 176_000,
      dailyVariableCents: 3_482,
      variableDays: 90,
      savingsNotMovedCents: 20_000,
      payLeftOut: [],
      lowest: { date: '2026-10-08', balanceCents: 203_252 },
    })
    expect(flow.days).toHaveLength(30)
    expect(flow.days[0]).toEqual({ date: '2026-09-25', balanceCents: 374_518 })
    expect(flow.days[6]).toEqual({ date: '2026-10-01', balanceCents: 227_626 })
    expect(flow.days[29]?.date).toBe('2026-10-24')
    expect(flow.pay.map((p) => [p.date, p.categoryId, p.cents])).toEqual([
      ['2026-09-25', PAY, 210_000],
      ['2026-10-09', PAY, 210_000],
      ['2026-10-23', PAY, 210_000],
    ])
    // Rent paid on the 1st is not counted again this month (D5).
    expect(flow.bills).toEqual([
      { date: '2026-09-25', categoryId: NET, cents: 8_000, seen: 'not_seen' },
      { date: '2026-09-28', categoryId: PHONE, cents: 6_000, seen: 'due' },
      { date: '2026-10-01', categoryId: RENT, cents: 120_000, seen: 'due' },
      { date: '2026-10-20', categoryId: NET, cents: 8_000, seen: 'due' },
    ])
    expect(flow.billsNext7.map((b) => b.categoryId)).toEqual([NET, PHONE, RENT])
  })

  it('leaves out a bill a real charge already replaced this month', () => {
    const charged = { postedOn: d('2026-09-22'), amountCents: -6_100, categoryId: PHONE }
    expect(cashFlow30({ ...example, entries: [...example.entries, charged] }).bills.map((b) => b.categoryId)).toEqual([NET, RENT, NET])
  })

  it('pays a 31st on a short month’s last day, and a bill with no day tomorrow or on the 1st', () => {
    const flow = cashFlow30({
      ...example,
      categories: [...example.categories, { id: GYM, name: 'Gym', kind: 'subscription', sortOrder: 0 }, { id: PARKING, name: 'Parking', kind: 'bill', sortOrder: 3 }],
      planHistory: [
        ...example.planHistory,
        { categoryId: GYM, effectiveMonth: d('2026-09-01'), plannedCents: 4_000, dueDay: 31 },
        { categoryId: PARKING, effectiveMonth: d('2026-09-01'), plannedCents: 2_500, dueDay: null },
      ],
    })
    expect(flow.bills.filter((b) => b.categoryId === GYM || b.categoryId === PARKING)).toEqual([
      { date: '2026-09-25', categoryId: PARKING, cents: 2_500, seen: 'not_seen' },
      { date: '2026-09-30', categoryId: GYM, cents: 4_000, seen: 'due' },
      { date: '2026-10-01', categoryId: PARKING, cents: 2_500, seen: 'due' },
    ])
  })

  it('leaves out the daily amount with under 14 days of records', () => {
    // From 11 September, 14 days, with nothing spent on Variable in them: $0.00 a day.
    expect(cashFlow30({ ...example, historyStart: d('2026-09-12') })).toMatchObject({ dailyVariableCents: null, variableDays: 13 })
    expect(cashFlow30({ ...example, historyStart: d('2026-09-11') })).toMatchObject({ dailyVariableCents: 0, variableDays: 14 })
  })

  it('leaves a card payment out of today’s balance (D9), and takes the earliest of equal days', () => {
    // No pay, no bills and no daily amount: every day is today's 1,760.00, and
    // the tightest is the first. Paying $500.00 to the card is not spending.
    const flow = cashFlow30({
      ...example,
      historyStart: d('2026-09-12'),
      categories: [...example.categories, { id: 'c-card', name: 'Card payment', kind: 'transfer', sortOrder: 0 }],
      entries: [...example.entries, { postedOn: d('2026-09-20'), amountCents: -50_000, categoryId: 'c-card' }],
      planHistory: [],
      paySchedules: [],
    })
    expect(flow).toMatchObject({ todayCents: 176_000, lowest: { date: '2026-09-25', balanceCents: 176_000 } })
  })

  it('counts a bill due today and not yet charged as due tomorrow', () => {
    const flow = cashFlow30({ ...example, asOf: d('2026-09-28') })
    // Phone, due today, and Internet, due on the 20th, both tomorrow, in the Bills list's order.
    expect(flow.bills.slice(0, 2)).toEqual([
      { date: '2026-09-29', categoryId: PHONE, cents: 6_000, seen: 'not_seen' },
      { date: '2026-09-29', categoryId: NET, cents: 8_000, seen: 'not_seen' },
    ])
  })

  it('draws no line without a typed start, and still lists the bills due this week (D17)', () => {
    const flow = cashFlow30({ ...example, startingBalanceCents: null })
    expect(flow).toMatchObject({ status: 'no_start', todayCents: null, days: [], lowest: null })
    expect(flow.billsNext7).toHaveLength(3)
  })

  it('leaves out pay with no day, and names it', () => {
    const flow = cashFlow30({ ...example, paySchedules: [] })
    expect(flow).toMatchObject({ pay: [], payLeftOut: [PAY] })
  })
})
