import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { answerQuery, type AnswerQueryInput, type AskQuery } from '../src/index.js'
import { BASE, row } from './ask-example.js'

/** One worked answer per intent (plan A24), by hand from F48's example (docs/formula-decisions.md). */

const d = isoDate
const cents = (value: number) => ({ unit: 'cents', value })
const INPUT: AnswerQueryInput = {
  ...BASE,
  entries: [...BASE.entries, ...['2026-06-10', '2026-07-10', '2026-08-10', '2026-09-10'].map((day) => row(day, -12.99, 'music', 'STREAMCO'))],
  query: { intent: 'spend_in', period: null, categoryIds: [], monthlyCents: null },
  forecast: { paySchedules: [], startingBalanceCents: 500_000 },
  goals: [{ name: 'Flight training', targetCents: 3_000_000, savedCents: 50_000, targetDate: null, fundCategoryId: 'fund', unitCostCents: 27_500 }],
  debts: { debts: [], extraPayments: [] },
  notSubscriptions: [],
}
const ask = (query: Partial<AskQuery>, over: Partial<AnswerQueryInput> = {}) => answerQuery({ ...INPUT, ...over, query: { ...INPUT.query, ...query } })
const AUGUST = { from: '2026-08-01', to: '2026-08-31' }

describe('answerQuery (F48)', () => {
  it('spend_in: a category over the period named', () => {
    expect(ask({ categoryIds: ['coffee'], period: { kind: 'last_month' } })).toEqual({
      status: 'answered',
      now: AUGUST,
      before: null,
      cutFrom: null,
      main: { say: 'spent_in', names: ['Coffee'], figures: { amount: cents(1_700) } },
      rows: [],
    })
  })

  it('compare: this month so far against the same days of last month', () => {
    expect(ask({ intent: 'compare', categoryIds: ['coffee'] })).toMatchObject({
      now: { from: '2026-09-01', to: '2026-09-24' },
      before: { from: '2026-08-01', to: '2026-08-24' },
      main: { say: 'compared', figures: { change: { unit: 'change', value: 100, direction: 'more' } } },
    })
  })

  it('top_categories and top_shops: where the money went', () => {
    expect(ask({ intent: 'top_categories' })).toMatchObject({ main: { say: 'top_categories', names: ['Rent'] } })
    expect(ask({ intent: 'top_shops', period: { kind: 'last_month' } })).toMatchObject({ main: { say: 'top_shops', names: ['LANDLORD'], figures: { amount: cents(150_000) } } })
  })

  it('subscriptions: how many, and a year’s cost, less those marked Not a subscription', () => {
    expect(ask({ intent: 'subscriptions' })).toMatchObject({
      main: { say: 'subscriptions', figures: { count: { unit: 'count', value: 1 }, year: cents(15_588) } },
      rows: [{ say: 'subscription', names: ['STREAMCO'], figures: { price: cents(1_299), year: cents(15_588) } }],
    })
    expect(ask({ intent: 'subscriptions' }, { notSubscriptions: ['STREAMCO'] })).toMatchObject({ main: { say: 'no_subscriptions' }, rows: [] })
  })

  it('forecast and safe_to_spend: from the forecast’s reads, or missing when they did not load', () => {
    expect(ask({ intent: 'forecast' })).toMatchObject({ status: 'answered', main: { say: 'forecast_range' } })
    expect(ask({ intent: 'safe_to_spend' })).toMatchObject({ main: { say: 'safe', figures: { days: { unit: 'count', value: 7 } } } })
    expect(ask({ intent: 'safe_to_spend' }, { forecast: null })).toEqual({ status: 'missing', what: 'forecast' })
  })

  it('goal_date and what_if_cut: the main goal first', () => {
    // June, July and August are whole: $0.00, $0.00 and $500.00 moved in, a middle pace of $0.00.
    expect(ask({ intent: 'goal_date' })).toMatchObject({ main: { say: 'goal_no_pace', names: ['Flight training'] } })
    // So $50.00 a month reaches the $29,500.00 left alone: $11.54 a week, 2,557 weeks.
    expect(ask({ intent: 'what_if_cut', categoryIds: ['coffee'], monthlyCents: 5_000 })).toMatchObject({
      main: { say: 'what_if_alone', names: ['Coffee'], figures: { monthly: cents(5_000), date: { unit: 'month_year', value: '2075-09-26' } } },
      rows: [{ say: 'goal', names: ['Flight training'] }],
    })
  })

  it('debt_free: the payoff plan’s date, or why there is none', () => {
    const car = { name: 'Car loan', startMonth: d('2026-01-01'), startingBalanceCents: 120_000, minimumPaymentCents: 10_000, aprBasisPoints: 0 }
    // Twelve payments of $100.00 from January: the last is December's.
    expect(ask({ intent: 'debt_free' }, { debts: { debts: [car], extraPayments: [] } })).toMatchObject({ main: { say: 'debt_free', figures: { month: { unit: 'month_year', value: '2026-12-01' } } } })
    expect(ask({ intent: 'debt_free' })).toMatchObject({ main: { say: 'no_debts' } })
    const card = { name: 'Card', startMonth: d('2026-01-01'), startingBalanceCents: 500_000, minimumPaymentCents: 1_000, aprBasisPoints: 2_000 }
    expect(ask({ intent: 'debt_free' }, { debts: { debts: [card], extraPayments: [] } })).toMatchObject({ main: { say: 'never_paid_off', names: ['Card'] } })
    expect(ask({ intent: 'debt_free' }, { debts: null })).toEqual({ status: 'missing', what: 'debts' })
  })

  it('explain_month: the Month’s own figures, for one month even when asked about a year', () => {
    expect(ask({ intent: 'explain_month', period: { kind: 'last_month' } })).toMatchObject({ now: AUGUST, main: { say: 'month', figures: { spent: cents(159_700 + 1_299) } } })
    expect(ask({ intent: 'explain_month', period: { kind: 'this_year' } })).toMatchObject({ now: { from: '2026-09-01', to: '2026-09-24' }, main: { say: 'month' } })
  })

  it('budget_left: the Month’s Left, or the Week’s', () => {
    expect(ask({ intent: 'budget_left', categoryIds: ['coffee'] })).toMatchObject({ main: { say: 'left', figures: { left: cents(2_900) } } })
    expect(ask({ intent: 'budget_left', categoryIds: ['coffee'], period: { kind: 'this_week' } })).toMatchObject({ main: { say: 'left', figures: { left: cents(1_000) } } })
  })

  it('says a month still to come is not yet, and one before the records is before them', () => {
    expect(ask({ categoryIds: ['coffee'], period: { kind: 'month', month: 12, yearsBack: 0 } })).toEqual({ status: 'not_yet' })
    expect(ask({ categoryIds: ['coffee'], period: { kind: 'month', month: 5, yearsBack: 0 } })).toEqual({ status: 'before_records', coveredFrom: '2026-06-01' })
  })

  it('counts a period the records start inside from their first day, and says so', () => {
    expect(ask({ categoryIds: ['coffee'], period: { kind: 'this_year' } })).toMatchObject({
      now: { from: '2026-06-01', to: '2026-09-24' },
      cutFrom: '2026-06-01',
      main: { figures: { amount: cents(2_800) } },
    })
  })
})
