import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { checkinWeek, impulseShare, questionsToAsk, suggestedWeeklyLimit, weeklyRecap, type CheckinInput } from '../src/index.js'

/** Suite tests, worked by hand from F42 (docs/formula-decisions.md). Sunday 27 September 2026. */

const d = isoDate
const CATEGORIES: CheckinInput['categories'] = [
  { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 1, weeklyBudgetCents: 7_000 },
  { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 2, weeklyBudgetCents: 14_000 },
  { id: 'coffee', name: 'Coffee', kind: 'variable', sortOrder: 3, weeklyBudgetCents: null },
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 4, weeklyBudgetCents: null },
]
let n = 0
const row = (date: string, cents: number, categoryId: string) => ({ id: `t${++n}`, postedOn: d(date), amountCents: cents, categoryId })
/** F42's week of 21 to 27 September. */
const WEEK = [
  row('2026-09-22', -450, 'coffee'),
  row('2026-09-23', -8_420, 'dining'),
  row('2026-09-24', -11_240, 'groceries'),
  row('2026-09-25', -1_999, 'coffee'),
  row('2026-09-25', -150_000, 'rent'),
  row('2026-09-26', -2_000, 'dining'),
  row('2026-09-26', 1_500, 'groceries'),
]
const BEFORE = [row('2026-09-15', -25_000, 'groceries')]
const input = (over: Partial<CheckinInput> = {}): CheckinInput => ({
  asOf: d('2026-09-27'),
  historyStart: d('2026-02-01'),
  readFrom: d('2025-09-01'),
  categories: CATEGORIES,
  entries: [...WEEK, ...BEFORE],
  ...over,
})

describe('checkinWeek (F42)', () => {
  it('is the week ending on a Sunday on that Sunday, and stays on it until the next', () => {
    expect(checkinWeek({ asOf: d('2026-09-27') })).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(checkinWeek({ asOf: d('2026-09-28') })).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(checkinWeek({ asOf: d('2026-09-30') })).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(checkinWeek({ asOf: d('2026-10-03') })).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(checkinWeek({ asOf: d('2026-10-04') })).toEqual({ start: '2026-09-28', end: '2026-10-04' })
  })
})

describe('weeklyRecap (F42)', () => {
  it('sums the week’s everyday spending net of refunds, and judges it against the Week’s Left to spend', () => {
    const recap = weeklyRecap(input())
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.week).toEqual({ start: '2026-09-21', end: '2026-09-27' })
    expect(recap.spentCents).toBe(22_609)
    // ($70.00 − $104.20) + ($140.00 − $97.40) − $24.49 of Coffee, which has no budget.
    expect(recap.budget).toEqual({ budgetCents: 21_000, leftCents: -1_609, kept: false, overCents: 1_609 })
    expect(recap.noSpendDays).toBe(2)
    expect(recap.top).toEqual({ categoryId: 'dining', spentCents: 10_420 })
  })

  it('breaks a tie for the top category by name in English order, the same on every device (architecture-a-02)', () => {
    const tied: CheckinInput['categories'] = [
      { id: 'z', name: 'Zoo', kind: 'variable', sortOrder: 0, weeklyBudgetCents: null },
      { id: 'a', name: 'Ärenden', kind: 'variable', sortOrder: 0, weeklyBudgetCents: null },
    ]
    const recap = weeklyRecap(input({ categories: tied, entries: [row('2026-09-22', -5_000, 'z'), row('2026-09-23', -5_000, 'a')] }))
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.top).toEqual({ categoryId: 'a', spentCents: 5_000 })
  })

  it('compares with the week before, where the records cover it', () => {
    const recap = weeklyRecap(input())
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.before?.spentCents).toBe(25_000)
    expect(recap.before?.change).toMatchObject({ changeCents: -2_391, direction: 'less' })

    // Records from Monday 21 September: the week is covered, the one before is not.
    const fresh = weeklyRecap(input({ historyStart: d('2026-09-21') }))
    if (fresh.status !== 'ready') throw new Error(fresh.status)
    expect(fresh.before).toBeNull()
  })

  it('calls a week kept at exactly $0.00 left, with nothing over', () => {
    const exact = [row('2026-09-23', -7_000, 'dining'), row('2026-09-24', -14_000, 'groceries')]
    const recap = weeklyRecap(input({ entries: exact }))
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.budget).toEqual({ budgetCents: 21_000, leftCents: 0, kept: true, overCents: 0 })
  })

  it('has no budget line when no Variable category has a weekly budget, and no top in a week of nothing', () => {
    const none = CATEGORIES.map((c) => ({ ...c, weeklyBudgetCents: c.kind === 'variable' ? null : c.weeklyBudgetCents }))
    const recap = weeklyRecap(input({ categories: none, entries: [] }))
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.spentCents).toBe(0)
    expect(recap.budget).toBeNull()
    expect(recap.top).toBeNull()
    expect(recap.noSpendDays).toBe(7)
  })

  it('has no top in a week whose only everyday row is a refund', () => {
    const recap = weeklyRecap(input({ entries: [row('2026-09-26', 1_500, 'groceries')] }))
    if (recap.status !== 'ready') throw new Error(recap.status)
    expect(recap.spentCents).toBe(-1_500)
    expect(recap.top).toBeNull()
  })

  it('gives a tie for the top to the list’s order', () => {
    const tie = [row('2026-09-23', -3_000, 'groceries'), row('2026-09-24', -3_000, 'dining')]
    const recap = weeklyRecap(input({ entries: tie }))
    expect(recap.status === 'ready' && recap.top).toEqual({ categoryId: 'dining', spentCents: 3_000 })
  })

  it('is not covered when the records start inside the week, and names where they do', () => {
    expect(weeklyRecap(input({ historyStart: d('2026-09-22') }))).toEqual({ status: 'not_covered', week: { start: '2026-09-21', end: '2026-09-27' }, coveredFrom: '2026-09-22' })
    // The first day read counts as much as history start.
    expect(weeklyRecap(input({ readFrom: d('2026-09-23') }))).toMatchObject({ status: 'not_covered', coveredFrom: '2026-09-23' })
    expect(weeklyRecap(input({ historyStart: null }))).toMatchObject({ status: 'not_covered', coveredFrom: null })
  })
})

describe('questionsToAsk (F42)', () => {
  const asked = (over: Partial<Parameters<typeof questionsToAsk>[0]> = {}) =>
    questionsToAsk({ asOf: d('2026-09-27'), categories: CATEGORIES, entries: [...WEEK, ...BEFORE], answered: [], ...over }).questions
  const ids = (qs: ReturnType<typeof asked>) => qs.map((q) => WEEK.find((r) => r.id === q.transactionId)?.amountCents)

  it('asks about the week’s three largest everyday charges of $20.00 or more, never one under', () => {
    const qs = asked()
    expect(ids(qs)).toEqual([-11_240, -8_420, -2_000])
    expect(qs[0]).toEqual({ transactionId: WEEK[2]!.id, postedOn: '2026-09-24', chargeCents: 11_240, categoryId: 'groceries' })
    // CAFE's $19.99, the rent (a bill) and the refund are never asked about.
    expect(qs.some((q) => q.chargeCents === 1_999 || q.categoryId === 'rent')).toBe(false)
  })

  it('never asks again about a charge already answered, in any week', () => {
    expect(ids(asked({ answered: [WEEK[1]!.id] }))).toEqual([-11_240, -2_000])
  })

  it('keeps the largest three, a tie going to the earlier day', () => {
    const more = [row('2026-09-21', -2_000, 'coffee'), row('2026-09-27', -9_000, 'dining')]
    const qs = asked({ entries: [...WEEK, ...more] })
    expect(qs.map((q) => [q.postedOn, q.chargeCents])).toEqual([
      ['2026-09-24', 11_240],
      ['2026-09-27', 9_000],
      ['2026-09-23', 8_420],
    ])
    const tie = asked({ entries: [row('2026-09-26', -2_000, 'dining'), row('2026-09-21', -2_000, 'coffee')] })
    expect(tie.map((q) => q.postedOn)).toEqual(['2026-09-21', '2026-09-26'])
  })

  it('asks about the week before on a weekday, and nothing outside the check-in’s week', () => {
    expect(ids(asked({ asOf: d('2026-09-30') }))).toEqual([-11_240, -8_420, -2_000])
    expect(asked({ asOf: d('2026-10-04') })).toEqual([])
  })
})

describe('impulseShare (F42)', () => {
  const answer = (askedWeek: string, a: 'planned' | 'impulse' | 'needed') => ({ askedWeek: d(askedWeek), answer: a })
  const share = (answers: ReturnType<typeof answer>[]) => impulseShare({ asOf: d('2026-09-27'), answers })

  it('is the impulse answers over the answers of the last eight weeks, half-up in basis points', () => {
    const five = [answer('2026-09-21', 'impulse'), answer('2026-09-14', 'planned'), answer('2026-08-03', 'impulse'), answer('2026-08-10', 'needed'), answer('2026-09-07', 'planned')]
    expect(share(five)).toEqual({ from: '2026-08-03', to: '2026-09-21', answers: 5, impulse: 2, shareBp: 4_000 })
    expect(share([answer('2026-09-21', 'impulse'), answer('2026-09-21', 'planned'), answer('2026-09-21', 'needed')]).shareBp).toBe(3_333)
    expect(share([answer('2026-09-21', 'impulse'), answer('2026-09-14', 'impulse'), answer('2026-09-21', 'needed')]).shareBp).toBe(6_667)
  })

  it('leaves out an answer from before the eight weeks, and has no share with no answers', () => {
    expect(share([answer('2026-07-27', 'impulse'), answer('2026-09-21', 'planned')])).toMatchObject({ answers: 1, impulse: 0, shareBp: 0 })
    expect(share([])).toMatchObject({ answers: 0, impulse: 0, shareBp: null })
  })
})

describe('suggestedWeeklyLimit (F42)', () => {
  /** Dining out's Actual in each of March to August, its six complete months before September. */
  const usual = (monthly: number) => ['03', '04', '05', '06', '07', '08'].map((m) => row(`2026-${m}-10`, -monthly, 'dining'))
  const limit = (over: Partial<CheckinInput> = {}, monthly = 30_000) => suggestedWeeklyLimit(input({ entries: [...WEEK, ...BEFORE, ...usual(monthly)], ...over }))
  const noBudget = CATEGORIES.map((c) => (c.id === 'dining' ? { ...c, weeklyBudgetCents: null } : c))

  it('offers the top category the lower of last week and its usual week, rounded down to $5', () => {
    // $300.00 × 12 ÷ 52 = $69.23…, under last week’s $104.20: $65.00, under the $70.00 budget.
    expect(limit()).toEqual({ categoryId: 'dining', limitCents: 6_500, from: 'usual', lastWeekCents: 10_420, usualCents: 30_000 })
  })

  it('takes last week when it is lower, and never offers more than the weekly budget already set', () => {
    // $500.00 × 12 ÷ 52 = $115.38…, over $104.20: $100.00, which the $70.00 budget caps.
    expect(limit({}, 50_000)).toMatchObject({ limitCents: 7_000, from: 'budget' })
    expect(limit({ categories: noBudget }, 50_000)).toMatchObject({ limitCents: 10_000, from: 'last_week' })
  })

  it('offers at least $5.00', () => {
    // $20.00 × 12 ÷ 52 = $4.61…, which rounds down to $0.00.
    expect(limit({ categories: noBudget }, 2_000)).toMatchObject({ limitCents: 500, from: 'usual' })
  })

  it('does not round the usual week before comparing it', () => {
    // $451.53 × 12 ÷ 52 = $104.199…: under $104.20 by a fraction of a cent, so the usual week is the lower, still $100.00.
    expect(limit({ categories: noBudget }, 45_153)).toMatchObject({ limitCents: 10_000, from: 'usual' })
  })

  it('stands on last week alone with no complete month', () => {
    expect(limit({ categories: noBudget, historyStart: d('2026-09-01') })).toEqual({ categoryId: 'dining', limitCents: 10_000, from: 'last_week', lastWeekCents: 10_420, usualCents: null })
  })

  it('offers nothing when the week is not covered or nothing was spent', () => {
    expect(limit({ historyStart: d('2026-09-22') })).toBeNull()
    expect(suggestedWeeklyLimit(input({ entries: usual(30_000) }))).toBeNull()
  })
})
