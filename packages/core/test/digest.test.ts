import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { factsDigest, type FactsDigestInput } from '../src/index.js'

/** Suite tests, worked by hand from F24–F28 and F44 (docs/formula-decisions.md). */

const d = isoDate
const spend = (postedOn: string, cents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents: -cents, categoryId })
const DINING = '3f2a9c1e-8b4d-4e6f-a1b2-c3d4e5f60718'
const GROCERIES = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a'

/**
 * Thursday 24 September 2026, records from 1 August. By 24 Aug $300.00 on
 * Dining out and Groceries; by 24 Sep $150.00. The week of 21 Sep has $80.00
 * to Thursday, the week before $20.00.
 */
const base: FactsDigestInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-08-01'),
  readFrom: d('2026-08-01'),
  categories: [
    { id: DINING, name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: GROCERIES, name: 'Groceries', kind: 'variable', sortOrder: 1 },
  ],
  budgetHistory: [],
  planHistory: [],
  entries: [
    spend('2026-08-03', 10_000, DINING),
    spend('2026-08-20', 20_000, GROCERIES),
    spend('2026-09-02', 5_000, DINING),
    spend('2026-09-15', 2_000, DINING),
    spend('2026-09-22', 8_000, GROCERIES),
  ],
  latestStatementEnd: d('2026-09-07'),
  pendingCount: 3,
  goals: [],
}

const kinds = (input: FactsDigestInput) => factsDigest(input).facts.map((f) => f.kind)

describe('factsDigest, version 1', () => {
  it('puts stale data first, rows waiting second, then this month and this week against the same days before', () => {
    const digest = factsDigest(base)
    expect(digest.version).toBe(2)
    expect(digest.facts.slice(0, 4).map((f) => f.key)).toEqual(['data:stale', 'review:waiting', 'summary:month', 'summary:week'])
  })

  it('says how long ago the latest statement ends, from 11 days', () => {
    // 7 Sep to 24 Sep is 17 days.
    expect(factsDigest(base).facts[0]).toMatchObject({
      kind: 'stale_data', subject: { type: 'data', id: null, label: 'Your statements' }, meaning: 'info', notable: true,
      figures: { through: { unit: 'date', value: '2026-09-07' }, days: { unit: 'count', value: 17 } },
      cause: 'stale_data:2026-09-07',
    })
    expect(kinds({ ...base, latestStatementEnd: d('2026-09-14') })).not.toContain('stale_data')
    expect(kinds({ ...base, latestStatementEnd: d('2026-09-13') })).toContain('stale_data')
    expect(kinds({ ...base, latestStatementEnd: null })).not.toContain('stale_data')
  })

  it('counts the rows waiting in Review, and says nothing of none or of a count it could not read', () => {
    expect(factsDigest(base).facts[1]).toMatchObject({
      kind: 'rows_waiting', notable: true, figures: { count: { unit: 'count', value: 3 } }, cause: 'rows_waiting:2026-09-24',
    })
    expect(kinds({ ...base, pendingCount: 0 })).not.toContain('rows_waiting')
    expect(kinds({ ...base, pendingCount: null })).not.toContain('rows_waiting')
  })

  it('sets this month so far against the same days last month, sized by the summary band', () => {
    // $150.00 against $300.00: $150.00 less. Band max($25.00, 15% of $300.00) = $45.00; two bands or more is big.
    expect(factsDigest(base).facts[2]).toEqual({
      key: 'summary:month', kind: 'month_so_far', subject: { type: 'month', id: '2026-09-01', label: 'This month' },
      direction: 'down', size: 'big', evidence: 'thin', meaning: 'good', notable: true,
      figures: {
        now: { unit: 'cents', value: 15_000 }, before: { unit: 'cents', value: 30_000 },
        change: { unit: 'change', value: -15_000, direction: 'less' },
        now_to: { unit: 'date', value: '2026-09-24' }, before_to: { unit: 'date', value: '2026-08-24' },
      },
      impact: 15_000, cause: 'month_so_far:2026-09-24',
    })
  })

  it('sets this week to today against last week to the same weekday', () => {
    // 21–24 Sep $80.00 against 14–17 Sep $20.00: $60.00 more; band $25.00, so big.
    expect(factsDigest(base).facts[3]).toMatchObject({
      key: 'summary:week', kind: 'week_so_far', subject: { type: 'week', id: '2026-09-21', label: 'This week' },
      direction: 'up', size: 'big', meaning: 'watch',
      figures: { now: { value: 8_000 }, before: { value: 2_000 }, change: { value: 6_000, direction: 'more' } },
    })
  })

  it('says nothing of a window that starts before the records (F24)', () => {
    // Records from 8 August: 1–24 Aug is outside them, 14–17 Sep inside.
    expect(kinds({ ...base, historyStart: d('2026-08-08') })).toEqual(['stale_data', 'rows_waiting', 'week_so_far'])
    expect(kinds({ ...base, historyStart: null, latestStatementEnd: null, pendingCount: 0 })).toEqual([])
  })

  it('calls a change under $1.00 the same, and neither good nor watch', () => {
    const flat = { ...base, entries: [spend('2026-08-03', 1_000, DINING), spend('2026-09-03', 1_099, DINING)] }
    expect(factsDigest(flat).facts.find((f) => f.key === 'summary:month')).toMatchObject({
      direction: 'same', size: 'slight', meaning: 'info', notable: false,
    })
  })

  it('gives the same keys for the same records, and never an id in a label', () => {
    const keys = factsDigest(base).facts.map((f) => f.key)
    expect(factsDigest({ ...base, entries: [...base.entries].reverse() }).facts.map((f) => f.key)).toEqual(keys)
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    for (const fact of factsDigest(base).facts) expect(fact.subject.label).not.toMatch(uuid)
  })
})

/**
 * F27's worked example on 24 September 2026: records from March, Dining out
 * $300, $420, $360, $510, $390 and $450 from March to August ($307.60 of
 * August's by the 24th) and $520.00 by 24 September. Groceries $400.00 every
 * month on the 12th, on a $400.00 budget, and $360.00 by 24 September.
 */
const MONTHS = ['03', '04', '05', '06', '07', '08']
const history: FactsDigestInput = {
  ...base,
  historyStart: d('2026-03-01'),
  readFrom: d('2025-09-01'),
  budgetHistory: [{ categoryId: GROCERIES, month: d('2026-03-01'), applies: 'onward', budgetCents: 40_000 }],
  entries: [
    ...[30_000, 42_000, 36_000, 51_000, 39_000].map((v, i) => spend(`2026-${MONTHS[i]}-10`, v, DINING)),
    spend('2026-08-10', 30_760, DINING),
    spend('2026-08-28', 14_240, DINING),
    spend('2026-09-05', 52_000, DINING),
    ...MONTHS.map((m) => spend(`2026-${m}-12`, 40_000, GROCERIES)),
    spend('2026-09-10', 36_000, GROCERIES),
  ],
  latestStatementEnd: d('2026-09-20'),
  pendingCount: 0,
}

describe('factsDigest, version 1: categories', () => {
  it('ranks notable facts by impact, then the rest, after the summaries', () => {
    expect(factsDigest(history).facts.map((f) => f.key)).toEqual([
      'summary:month',
      'summary:week',
      `cat:${DINING}:change`,
      `cat:${GROCERIES}:near_budget`,
      `cat:${GROCERIES}:change`,
      `cat:${GROCERIES}:pace`,
    ])
    expect(factsDigest(history).completeMonths).toBe(6)
  })

  it('sets a Variable row against the same days last month, sized by its usual month', () => {
    // $520.00 against $307.60: $212.40 more; band $108.00 (F27), so clear; impact 79,650 (F44).
    expect(factsDigest(history).facts[2]).toEqual({
      key: `cat:${DINING}:change`, kind: 'category_change', subject: { type: 'category', id: DINING, label: 'Dining out' },
      direction: 'up', size: 'clear', evidence: 'solid', meaning: 'watch', notable: true,
      figures: {
        now: { unit: 'cents', value: 52_000 }, before: { unit: 'cents', value: 30_760 },
        change: { unit: 'change', value: 21_240, direction: 'more' }, usual: { unit: 'cents', value: 40_500 },
        before_month: { unit: 'month', value: '2026-08-01' }, months: { unit: 'count', value: 6 },
      },
      impact: 79_650, cause: `category_change:${DINING}:2026-09-01:up`,
    })
    // Groceries $360.00 against $400.00: band max($25, $60, 0) × 24 ÷ 30 = $48.00, and $40.00 is slight.
    expect(factsDigest(history).facts[4]).toMatchObject({ direction: 'down', size: 'slight', meaning: 'good', notable: false, impact: 15_000 })
  })

  it('says a budget is nearly used, and where the pace is heading (F28)', () => {
    const facts = factsDigest(history).facts
    expect(facts[3]).toMatchObject({
      kind: 'near_budget', evidence: 'solid', meaning: 'watch', notable: true, impact: 12_000,
      figures: { actual: { value: 36_000 }, budget: { value: 40_000 }, left: { value: 4_000 } },
      cause: `near_budget:${GROCERIES}:2026-09-01`,
    })
    // $450.00 is $50.00 over, under the $60.00 line: said, but not a card.
    expect(facts[5]).toMatchObject({ kind: 'budget_pace', evidence: 'some', notable: false, impact: 10_000, figures: { pace: { value: 45_000 }, over: { value: 5_000 } } })
  })

  it('says a budget is passed, with no pace beside it', () => {
    const over = { ...history, entries: [...history.entries.slice(0, -1), spend('2026-09-10', 43_000, GROCERIES)] }
    const kinds = factsDigest(over).facts.filter((f) => f.subject.id === GROCERIES).map((f) => f.kind)
    expect(kinds).toEqual(['over_budget', 'category_change'])
    expect(factsDigest(over).facts.find((f) => f.kind === 'over_budget')).toMatchObject({ notable: true, figures: { over: { value: 3_000 } } })
  })

  it('takes the usual month only from months that were read', () => {
    // Read from August: one complete month, so the usual month is August's $450.00, thin:
    // band max($25, 25% of $450.00) × 24 ÷ 30 = $90.00, and $212.40 is big.
    expect(factsDigest({ ...history, readFrom: d('2026-08-01') }).facts.find((f) => f.key === `cat:${DINING}:change`)).toMatchObject({
      size: 'big', evidence: 'thin', impact: 26_550, figures: { usual: { value: 45_000 }, months: { value: 1 } },
    })
  })

  it('keeps at most 12 facts, the summaries first', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `v${i}`, name: `Shop ${String.fromCharCode(65 + i)}`, kind: 'variable' as const, sortOrder: i }))
    const input = { ...history, categories: many, budgetHistory: [], entries: many.flatMap((c, i) => [spend('2026-08-05', 1_000, c.id), spend('2026-09-05', 5_000 + i, c.id)]) }
    const facts = factsDigest(input).facts
    expect(facts).toHaveLength(12)
    expect(facts[0]!.key).toBe('summary:month')
  })
})

/**
 * F34's wins on 24 September 2026, records from 1 August. The flight fund had
 * $100.00 moved in by 24 August and $250.00 by 24 September, $150.00 of it on
 * the 15th, after the eve of last week's Monday (F33).
 */
const FUND = 'c-flight-fund'
const moveIn = (postedOn: string, cents: number) => ({ postedOn: d(postedOn), amountCents: -cents, categoryId: FUND })
const flightGoal = { id: 'g1', name: 'Flight training', targetCents: 3_000_000, savedCents: 1_265_000, unitCostCents: 27_500, fundCategoryId: FUND, typedOn: d('2026-09-01') }
const wins: FactsDigestInput = {
  ...base,
  categories: [...base.categories, { id: FUND, name: 'Flight fund', kind: 'savings', sortOrder: 0 }],
  entries: [...base.entries, moveIn('2026-08-12', 10_000), moveIn('2026-09-02', 10_000), moveIn('2026-09-15', 15_000)],
  latestStatementEnd: null,
  pendingCount: 0,
  goals: [flightGoal],
}

describe('factsDigest, version 1: wins', () => {
  it('says more was saved than by this day last month, sized by the summary band', () => {
    // $250.00 against $100.00: $150.00 more; band max($25.00, $15.00), so big.
    expect(factsDigest(wins).facts.find((f) => f.kind === 'saved_more')).toEqual({
      key: 'summary:saved', kind: 'saved_more', subject: { type: 'month', id: '2026-09-01', label: 'This month' },
      direction: 'up', size: 'big', evidence: 'thin', meaning: 'good', notable: true,
      figures: {
        now: { unit: 'cents', value: 25_000 }, before: { unit: 'cents', value: 10_000 },
        change: { unit: 'change', value: 15_000, direction: 'more' }, before_month: { unit: 'month', value: '2026-08-01' },
      },
      impact: 15_000, cause: 'saved_more:2026-09-01',
    })
  })

  it('says nothing of saving less, or the same', () => {
    const less = { ...wins, entries: [...base.entries, moveIn('2026-08-12', 30_000), moveIn('2026-09-15', 15_000)] }
    expect(kinds(less)).not.toContain('saved_more')
    const same = { ...wins, entries: [...base.entries, moveIn('2026-08-12', 15_000), moveIn('2026-09-15', 15_050)] }
    expect(kinds(same)).not.toContain('saved_more')
  })

  it('cheers each active goal’s milestone, worth one step of it (F33)', () => {
    // $12,500.00 then is 45.45… h, 45 h; $12,650.00 now is 46 h: no 5 hours passed.
    expect(kinds(wins)).not.toContain('goal_milestone')
    // $12,350.00 then is 44 h: 45 passed. One step is 5 × $275.00, solid: 137,500 × 3.
    const passed = { ...wins, entries: [...wins.entries, moveIn('2026-09-16', 15_000)] }
    expect(factsDigest(passed).facts.find((f) => f.kind === 'goal_milestone')).toEqual({
      key: 'goal:g1:milestone', kind: 'goal_milestone', subject: { type: 'goal', id: 'g1', label: 'Flight training' },
      direction: 'none', size: null, evidence: 'solid', meaning: 'good', notable: true,
      figures: { milestone: { unit: 'hours', value: 45 } },
      impact: 412_500, cause: 'goal_milestone:g1:45',
    })
  })

  it('cheers a goal in dollars at each tenth, worth a tenth of its target', () => {
    // $420.00 then of $1,000.00, $570.00 now: half passed; a tenth is $100.00, solid.
    const emergency = { ...flightGoal, id: 'g2', name: 'Emergency', targetCents: 100_000, savedCents: 57_000, unitCostCents: null }
    expect(factsDigest({ ...wins, goals: [emergency] }).facts.find((f) => f.kind === 'goal_milestone')).toMatchObject({
      key: 'goal:g2:milestone', figures: { milestone: { unit: 'share', value: 5_000 } }, impact: 30_000, cause: 'goal_milestone:g2:5000',
    })
  })
})

describe('factsDigest: trends (F37)', () => {
  /**
   * Friday 25 September 2026, records from 1 March: March to August are
   * complete. Dining out is F37's, rising steadily; Groceries the mirror,
   * falling; Coffee is F37's, with no clear trend.
   */
  const COFFEE = '5b4a3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d'
  const series = (id: string, dollars: readonly number[]) => dollars.map((v, i) => spend(`2026-0${3 + i}-12`, v * 100, id))
  const trending: FactsDigestInput = {
    ...base,
    asOf: d('2026-09-25'),
    historyStart: d('2026-03-01'),
    readFrom: d('2026-03-01'),
    categories: [...base.categories, { id: COFFEE, name: 'Coffee', kind: 'variable', sortOrder: 2 }],
    entries: [
      ...series(DINING, [300, 340, 330, 380, 420, 450]),
      ...series(GROCERIES, [450, 420, 380, 330, 340, 300]),
      ...series(COFFEE, [60, 62, 59, 61, 60, 63]),
    ],
    latestStatementEnd: null,
    pendingCount: null,
  }
  const trendsOf = (input: FactsDigestInput) => factsDigest(input).facts.filter((f) => f.kind === 'category_trend')

  it('says a category is rising steadily, one to watch, from its first month to its last', () => {
    // $150.00 from first to last against a band of $135.00: clear, and worth $150.00 × 3 on six months.
    expect(trendsOf(trending).find((f) => f.direction === 'up')).toEqual({
      key: `cat:${DINING}:trend`, kind: 'category_trend', subject: { type: 'category', id: DINING, label: 'Dining out' },
      direction: 'up', size: 'clear', evidence: 'solid', meaning: 'watch', notable: true,
      figures: {
        first: { unit: 'cents', value: 30_000 }, last: { unit: 'cents', value: 45_000 },
        change: { unit: 'change', value: 15_000, direction: 'more' },
        first_month: { unit: 'month', value: '2026-03-01' }, last_month: { unit: 'month', value: '2026-08-01' },
        months: { unit: 'count', value: 6 }, usual: { unit: 'cents', value: 36_000 },
      },
      impact: 45_000, cause: `category_trend:${DINING}:2026-08-01:up`,
    })
  })

  it('cheers one falling steadily, and says nothing of one with no clear trend', () => {
    const trends = trendsOf(trending)
    expect(trends.map((f) => [f.subject.label, f.direction, f.meaning])).toEqual([
      ['Dining out', 'up', 'watch'],
      ['Groceries', 'down', 'good'],
    ])
    expect(trends[1]!.figures['change']).toEqual({ unit: 'change', value: -15_000, direction: 'less' })
  })

  it('never names a trend on 3 complete months, or on months that were not read', () => {
    expect(trendsOf({ ...trending, historyStart: d('2026-06-01') })).toEqual([])
    expect(trendsOf({ ...trending, readFrom: d('2026-06-01') })).toEqual([])
  })
})

describe('factsDigest: habits (F40)', () => {
  // Records from Monday 1 June; Dining out has $70.00 a week, and one dear meal on the 12th of June, July and August.
  const month: FactsDigestInput = {
    ...base,
    historyStart: d('2026-06-01'),
    readFrom: d('2025-09-01'),
    categories: [{ id: DINING, name: 'Dining out', kind: 'variable', sortOrder: 0 }],
    entries: [spend('2026-06-12', 30_000, DINING), spend('2026-07-12', 32_000, DINING), spend('2026-08-12', 25_000, DINING), spend('2026-09-15', 2, DINING)],
    latestStatementEnd: null,
    pendingCount: 0,
  }
  const habits: FactsDigestInput = { ...month, habits: { weeklyBudgets: [{ categoryId: DINING, weeklyBudgetCents: 7_000 }] } }
  const winsOf = (input: FactsDigestInput) => factsDigest(input).facts.filter((f) => f.kind === 'spending_streak' || f.kind === 'personal_best')

  it('cheers five weeks in a row within budget, and August as Dining out’s lowest month', () => {
    // The weeks of 17 August to 14 September are kept; the last left $69.98, × 52 ÷ 12 = $303.246…, $303.25 a month, solid.
    expect(winsOf(habits)).toEqual([
      {
        key: 'habits:streak', kind: 'spending_streak', subject: { type: 'week', id: '2026-09-14', label: 'Everyday spending' },
        direction: 'none', size: null, evidence: 'solid', meaning: 'good', notable: true,
        figures: { weeks: { unit: 'count', value: 5 }, best: { unit: 'count', value: 5 }, left: { unit: 'cents', value: 6_998 }, week: { unit: 'date', value: '2026-09-14' } },
        impact: 90_975, cause: 'spending_streak:2026-09-14',
      },
      {
        key: `cat:${DINING}:best`, kind: 'personal_best', subject: { type: 'category', id: DINING, label: 'Dining out' },
        direction: 'down', size: null, evidence: 'some', meaning: 'good', notable: true,
        figures: {
          now: { unit: 'cents', value: 25_000 },
          before: { unit: 'cents', value: 30_000 },
          change: { unit: 'change', value: -5_000, direction: 'less' },
          month: { unit: 'month', value: '2026-08-01' },
          before_month: { unit: 'month', value: '2026-06-01' },
          months: { unit: 'count', value: 3 },
        },
        impact: 10_000, cause: `personal_best:${DINING}:2026-08-01`,
      },
    ])
  })

  it('says nothing of a single week, of a streak with no weekly budget, or of habits it was not asked about', () => {
    const one = { ...habits, entries: [...habits.entries, spend('2026-09-08', 7_001, DINING)] }
    expect(winsOf(one).map((f) => f.kind)).toEqual(['personal_best'])
    expect(winsOf({ ...habits, habits: { weeklyBudgets: [] } }).map((f) => f.kind)).toEqual(['personal_best'])
    expect(winsOf(month)).toEqual([])
  })
})
