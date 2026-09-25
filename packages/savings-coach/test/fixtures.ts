import { type Fact, type FactsDigestInput, factsDigest, isoDate } from '@budget/core'

const d = isoDate
const spend = (postedOn: string, cents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents: -cents, categoryId })
const monthly = (day: string, cents: number, id: string) => ['06', '07', '08'].map((m) => spend(`2026-${m}-${day}`, cents, id))
const budget = (categoryId: string, budgetCents: number) => ({ categoryId, month: d('2026-06-01'), applies: 'onward' as const, budgetCents })

/**
 * Thursday 24 September 2026, records from June: every kind of fact digest
 * version 1 makes. Dining out doubles (a big rise); Groceries halves (a
 * big fall); Fuel is $20.00 over its budget; Fun has $15.00 left and is on
 * pace to go over; the latest statement ends 17 days ago; 2 rows wait.
 */
export const EVERY_KIND: FactsDigestInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-06-01'),
  readFrom: d('2025-09-01'),
  categories: [
    { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 1 },
    { id: 'fuel', name: 'Fuel', kind: 'variable', sortOrder: 2 },
    { id: 'fun', name: 'Fun', kind: 'variable', sortOrder: 3 },
  ],
  budgetHistory: [budget('groceries', 40_000), budget('fuel', 10_000), budget('fun', 20_000)],
  planHistory: [],
  entries: [
    ...monthly('10', 30_000, 'dining'),
    spend('2026-09-03', 60_000, 'dining'),
    ...monthly('12', 40_000, 'groceries'),
    spend('2026-09-12', 20_000, 'groceries'),
    ...monthly('05', 10_000, 'fuel'),
    spend('2026-09-05', 12_000, 'fuel'),
    ...monthly('06', 18_000, 'fun'),
    spend('2026-09-06', 18_500, 'fun'),
  ],
  latestStatementEnd: d('2026-09-07'),
  pendingCount: 2,
  goals: [],
}

export const FACTS: readonly Fact[] = factsDigest(EVERY_KIND).facts

const moveIn = (postedOn: string, cents: number) => ({ postedOn: d(postedOn), amountCents: -cents, categoryId: 'fund' })

/**
 * The two wins (F33, F34), on the same day, records from August: $100.00
 * moved into the flight fund by 24 August and $400.00 by 24 September, $300.00
 * of it since last week began, so Flight training passed 45 hours.
 */
export const WINS: FactsDigestInput = {
  ...EVERY_KIND,
  historyStart: d('2026-08-01'),
  categories: [{ id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 0 }],
  budgetHistory: [],
  entries: [moveIn('2026-08-12', 10_000), moveIn('2026-09-02', 10_000), moveIn('2026-09-15', 15_000), moveIn('2026-09-16', 15_000)],
  latestStatementEnd: null,
  pendingCount: 0,
  goals: [
    { id: 'g1', name: 'Flight training', targetCents: 3_000_000, savedCents: 1_265_000, unitCostCents: 27_500, fundCategoryId: 'fund', typedOn: d('2026-09-01') },
  ],
}

export const WIN_FACTS: readonly Fact[] = factsDigest(WINS).facts

const series = (id: string, dollars: readonly number[]) => dollars.map((v, i) => spend(`2026-0${3 + i}-12`, v * 100, id))

/**
 * Trends (F37), records from March, so six whole months: Dining out rises
 * steadily and Groceries falls steadily, each by $150.00 against a band of
 * $135.00.
 */
export const TRENDS: FactsDigestInput = {
  ...EVERY_KIND,
  historyStart: d('2026-03-01'),
  budgetHistory: [],
  entries: [...series('dining', [300, 340, 330, 380, 420, 450]), ...series('groceries', [450, 420, 380, 330, 340, 300])],
  latestStatementEnd: null,
  pendingCount: 0,
}

export const TREND_FACTS: readonly Fact[] = factsDigest(TRENDS).facts.filter((f) => f.kind === 'category_trend')

export function factOf(key: string): Fact {
  const fact = [...FACTS, ...WIN_FACTS, ...TREND_FACTS].find((f) => f.key === key)
  if (fact === undefined) throw new Error(`The fixture has no fact ${key}`)
  return fact
}

/**
 * The month's forecast (plan A13) on the same day, with a start typed that
 * leaves room ($5,000.00), one that runs short on a day ($500.00), and none.
 */
export function forecastOf(startingBalanceCents: number | null): Fact {
  const fact = factsDigest({ ...EVERY_KIND, forecast: { paySchedules: [], startingBalanceCents } }).forecast
  if (fact === null) throw new Error('The fixture has no forecast')
  return fact
}
