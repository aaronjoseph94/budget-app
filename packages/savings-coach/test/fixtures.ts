import { type Fact, type FactsDigestInput, type ShopEntry, factsDigest, isoDate } from '@budget/core'

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

const shop = (id: string, postedOn: string, cents: number, name: string, categoryId: string, by: ShopEntry['by'] = 'statement'): ShopEntry =>
  ({ id, postedOn: d(postedOn), amountCents: -cents, categoryId, shop: name, by })
const WEEKLY = ['07-04', '07-11', '07-18', '07-25', '08-01', '08-08', '08-15', '08-22', '08-29', '09-05', '09-12', '09-19']
const cafe = WEEKLY.map((day, i) => shop(`c${i}`, `2026-${day}`, 2_500, 'CAFE', 'dining'))

/**
 * Digest version 2's detectors (F38, F39), records from February: SPOTIFY's
 * price went up, GYM is a new monthly charge, $180.00 at CAFE is large,
 * FURNITURE CO is a new shop, COFFEE HOUSE charged the same twice, and a
 * typed $6.25 matches TEA ROOM's on the statement.
 */
const SHOP_ROWS: readonly ShopEntry[] = [
  ...['05', '06', '07', '08'].map((m) => shop(`s${m}`, `2026-${m}-14`, 1_199, 'SPOTIFY', 'music')),
  shop('s09', '2026-09-14', 1_299, 'SPOTIFY', 'music'),
  ...['07', '08', '09'].map((m) => shop(`g${m}`, `2026-${m}-20`, 4_500, 'GYM', 'fun')),
  ...cafe,
  shop('big', '2026-09-20', 18_000, 'CAFE', 'dining'),
  shop('sofa', '2026-09-12', 45_000, 'FURNITURE CO', 'groceries'),
  shop('k1', '2026-09-21', 450, 'COFFEE HOUSE', 'fuel'),
  shop('k2', '2026-09-23', 450, 'COFFEE HOUSE', 'fuel'),
  shop('t1', '2026-09-22', 625, 'TEA', 'fuel', 'hand'),
  shop('t2', '2026-09-23', 625, 'TEA ROOM', 'fuel'),
]

export const SHOPS: FactsDigestInput = {
  ...EVERY_KIND,
  historyStart: d('2026-02-01'),
  categories: [...EVERY_KIND.categories, { id: 'music', name: 'Music', kind: 'subscription', sortOrder: 4 }],
  budgetHistory: [],
  entries: SHOP_ROWS,
  latestStatementEnd: null,
  pendingCount: 0,
  shops: { entries: SHOP_ROWS, notSubscriptions: [] },
}

const DETECTORS: readonly Fact['kind'][] = ['price_rise', 'new_subscription', 'large_charge', 'new_shop', 'possible_double', 'counted_twice']
export const SHOP_FACTS: readonly Fact[] = factsDigest(SHOPS).facts.filter((f) => DETECTORS.includes(f.kind))

/**
 * The habits' wins (F40), records from Monday 1 June: $70.00 a week on
 * Dining out and one dear meal on the 12th of June, July and August, so
 * five weeks in a row within budget, and August its lowest month.
 */
export const HABITS: FactsDigestInput = {
  ...EVERY_KIND,
  categories: [EVERY_KIND.categories[0]!],
  budgetHistory: [],
  entries: [spend('2026-06-12', 30_000, 'dining'), spend('2026-07-12', 32_000, 'dining'), spend('2026-08-12', 25_000, 'dining')],
  latestStatementEnd: null,
  pendingCount: 0,
  habits: { weeklyBudgets: [{ categoryId: 'dining', weeklyBudgetCents: 7_000 }] },
}

export const HABIT_FACTS: readonly Fact[] = factsDigest(HABITS).facts.filter((f) => f.kind === 'spending_streak' || f.kind === 'personal_best')

export function factOf(key: string): Fact {
  const fact = [...FACTS, ...WIN_FACTS, ...TREND_FACTS, ...SHOP_FACTS, ...HABIT_FACTS].find((f) => f.key === key)
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
