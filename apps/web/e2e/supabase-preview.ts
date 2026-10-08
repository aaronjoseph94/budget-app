/**
 * The browser suite's Supabase (docs/design/rework/04-e2e.md): the real
 * supabase-js client whose fetch is answered in memory by the screen
 * tests' fake server (test/fake-supabase.ts), seeded with one invented
 * household: categories from the starter list, nine months of charges,
 * budgets, monthly amounts, pay days, goals, debts and three rows waiting
 * in Review. Every figure is invented; no shop name is real.
 *
 * vite.preview.config.ts puts this file in place of src/supabase.ts, so
 * the app runs unchanged and every request ends here. Each page load is
 * a fresh server, so each test starts from the same data. A query on the
 * address changes the seed where a test needs it (`?aioff`). The fake is
 * put on `window.__preview` so a test can read what reached the server.
 */
import { createFakeSupabase } from '../test/fake-supabase.js'
import { starterList } from '../src/lists.js'
import type { Category, LedgerRow } from '../src/ledger.js'

// Weekly budgets and goals, typed as the Week offers.
const WEEKLY: Record<string, number> = {
  Groceries: 15000, Restaurants: 6000, Gas: 6000, 'Movie Theater': 2000, Phone: 7000,
  'Income 1': 142500, 'Side Hustle': 10000, 'Flight training': 12500,
}
const order = new Map<string, number>()
const categories: Category[] = starterList('Flight training').map((c, i) => {
  const n = order.get(c.kind) ?? 0
  order.set(c.kind, n + 1)
  return { id: `c${i}`, name: c.name, kind: c.kind, sort_order: n, weekly_budget_cents: WEEKLY[c.name] ?? null }
})
const idOf = (name: string): string => {
  const found = categories.find((c) => c.name === name)
  if (found === undefined) throw new Error(`no starter category named ${name}`)
  return found.id
}
let seq = 0
const tx = (posted_on: string, amount_cents: number, category: string, merchant: string, source = 'card_pdf'): LedgerRow => ({
  id: `t${String(++seq).padStart(3, '0')}`, posted_on, amount_cents, merchant_raw: merchant, category_id: idOf(category), source,
})
const pend = (id: string, posted_on: string, amount_cents: number, merchant: string) => ({
  id, posted_on, amount_cents, merchant, merchant_raw: merchant, status: 'pending',
})

const d = (day: number) => `2026-09-${String(day).padStart(2, '0')}`
const transactions: LedgerRow[] = [
  ...[3, 6, 10, 13, 17, 20, 24, 27].map((day, i) => tx(d(day), -[8412, 6230, 11875, 4410, 9366, 7120, 10254, 3899][i]!, 'Groceries', 'CORNER MARKET ANYTOWN AB')),
  ...[2, 5, 9, 12, 14, 19, 21, 26].map((day, i) => tx(d(day), -[1845, 4755, 2310, 6120, 1499, 3875, 2640, 5230][i]!, 'Restaurants', 'NORTHWIND DINER ANYTOWN AB')),
  ...[4, 11, 18, 25].map((day, i) => tx(d(day), -[5210, 6034, 4876, 5590][i]!, 'Gas', 'CONTOSO FUEL #221 ANYTOWN AB')),
  tx(d(7), -8999, 'Clothing', 'FABRIKAM OUTFITTERS'),
  tx(d(15), -4599, 'Clothing', 'TAILSPIN APPAREL'),
  tx(d(16), 4599, 'Clothing', 'TAILSPIN APPAREL RETURN'),
  tx(d(8), -2400, 'Movie Theater', 'LUCERNE CINEMAS'),
  tx(d(22), -1850, 'Movie Theater', 'LUCERNE CINEMAS'),
  tx(d(19), -3275, 'Game Night', 'WINGTIP GAMES'),
  tx(d(8), -412, 'Card interest & fees', 'INTEREST CHARGE'),
  tx(d(12), -8943, 'Electricity Bill', 'ALPINE POWER CO'),
  tx(d(18), -6500, 'Phone', 'LITWARE MOBILE'),
  tx(d(1), -13875, 'Car Insurance', 'MARGIE INSURANCE'),
  tx(d(1), -1799, 'Netflix', 'STREAMFLIX'),
  tx(d(1), -1199, 'Spotify', 'TUNESTREAM'),
  tx(d(28), -1399, 'Dropbox', 'CLOUDBOX STORAGE'),
  tx(d(15), -35000, 'Car Loan', 'Car loan payment', 'typed'),
  tx(d(15), 285000, 'Income 1', 'Pay', 'typed'),
  tx(d(30), 285000, 'Income 1', 'Pay', 'typed'),
  tx(d(11), 32500, 'Side Hustle', 'Tutoring', 'typed'),
  tx(d(16), -50000, 'Flight training', 'To flight fund', 'typed'),
  tx(d(16), -10000, 'Emergency Fund', 'To emergency fund', 'typed'),
  tx(d(10), 125000, 'Card payments', 'PAYMENT, THANK YOU'),
  tx(d(25), 12000, 'Side Hustle', 'Tutoring', 'typed'),
  tx(d(24), -12500, 'Flight training', 'To flight fund', 'typed'),
  tx(d(22), 40000, 'Card payments', 'PAYMENT, THANK YOU'),
  tx(d(14), -2899, 'Card payments', 'WINGTIP HARDWARE'),
  // January to August, so the Year, the Forecast and the Reports have a shape.
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((m) => {
    const mm = String(m).padStart(2, '0')
    const at = (day: number) => `2026-${mm}-${String(day).padStart(2, '0')}`
    const k = (base: number) => base + ((m * 3719) % 1700)
    return [
      tx(at(4), -k(7200), 'Groceries', 'CORNER MARKET ANYTOWN AB'),
      tx(at(11), -k(9100), 'Groceries', 'CORNER MARKET ANYTOWN AB'),
      tx(at(19), -k(6400), 'Groceries', 'CORNER MARKET ANYTOWN AB'),
      tx(at(8), -k(2300), 'Restaurants', 'NORTHWIND DINER ANYTOWN AB'),
      tx(at(22), -k(4100), 'Restaurants', 'NORTHWIND DINER ANYTOWN AB'),
      tx(at(13), -k(4800), 'Gas', 'CONTOSO FUEL #221 ANYTOWN AB'),
      tx(at(23), -1799, 'Netflix', 'STREAMFLIX'),
      tx(at(15), 285000, 'Income 1', 'Pay', 'typed'),
      tx(at(28), 285000, 'Income 1', 'Pay', 'typed'),
      ...(m % 3 === 0 ? [tx(at(9), 30000 + m * 1500, 'Side Hustle', 'Tutoring', 'typed')] : []),
      tx(at(16), -(m === 5 ? 90000 : 50000), 'Flight training', 'To flight fund', 'typed'),
      ...(m % 2 === 0 ? [tx(at(17), -10000, 'Emergency Fund', 'To emergency fund', 'typed')] : []),
    ]
  }),
]

const fake = createFakeSupabase({
  categories,
  transactions,
  // Goals in the owner's order: one with a date and hours, one paused, one reached.
  savings_goals: [
    {
      id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_245_000, target_date: '2027-06-30',
      unit_cost_cents: 27_500, unit_label: 'flight time', category_id: idOf('Flight training'), start_date: '2026-01-01',
      balance_as_of: '2026-08-31', sort_order: 0,
    },
    {
      id: 'g2', name: 'Emergency Fund', target_cents: 500_000, saved_cents: 120_000, target_date: '2027-06-01', unit_cost_cents: null,
      unit_label: null, category_id: idOf('Emergency Fund'), start_date: '2026-01-01', balance_as_of: '2026-06-30', sort_order: 1,
    },
    {
      id: 'g3', name: 'Down Payment', target_cents: 4_000_000, saved_cents: 350_000, target_date: null, unit_cost_cents: null,
      unit_label: null, category_id: idOf('Down Payment'), start_date: null, balance_as_of: '2026-09-01', sort_order: 2, status: 'paused',
    },
    {
      id: 'g4', name: 'Car Repair Fund', target_cents: 80_000, saved_cents: 85_000, target_date: '2026-12-01', unit_cost_cents: null,
      unit_label: null, category_id: idOf('Car Repair Fund'), start_date: '2026-03-15', balance_as_of: '2026-09-01', sort_order: 3,
      status: 'reached', reached_on: '2026-09-10',
    },
  ],
  category_budgets: (
    [
      ['Groceries', '2026-01-01', 'onward', 55000], ['Groceries', '2026-07-01', 'onward', 60000],
      ['Income 1', '2026-01-01', 'onward', 570000], ['Flight training', '2026-01-01', 'onward', 50000],
      ['Restaurants', '2026-09-01', 'onward', 25000], ['Gas', '2026-08-01', 'onward', 25000],
      ['Clothing', '2026-09-01', 'only', 10000], ['Movie Theater', '2026-09-01', 'onward', 5000],
      ['Rent', '2026-01-01', 'onward', 160000], ['Electricity Bill', '2026-09-01', 'onward', 8000],
      ['Phone', '2026-09-01', 'onward', 6500], ['Netflix', '2026-09-01', 'onward', 1799],
      ['Car Loan', '2026-09-01', 'onward', 35000], ['Income 1', '2026-09-01', 'onward', 570000],
      ['Side Hustle', '2026-09-01', 'onward', 40000], ['Flight training', '2026-09-01', 'onward', 60000],
      ['Emergency Fund', '2026-09-01', 'onward', 20000],
    ] as const
  ).map(([name, month, applies, cents], i) => ({ id: `bud${i}`, category_id: idOf(name), month, applies, budget_cents: cents })),
  // Monthly amounts and days paid, from a month on.
  category_plans: (
    [
      ['Rent', '2026-01-01', 160000, 1], ['Rent', '2026-10-01', 165000, 1], ['Electricity Bill', '2026-03-01', 9000, null],
      ['Water Bill', '2026-01-01', 4550, 31], ['Gas Bill', '2026-01-01', 6200, null], ['Phone', '2026-01-01', 6500, 18],
      ['Car Insurance', '2026-01-01', 13875, 1], ['Gym Membership', '2026-01-01', 5499, 1], ['Gym Membership', '2026-08-01', null, 1],
      ['Car Loan', '2026-02-01', 35000, 15], ['Netflix', '2026-01-01', 1799, 23], ['Spotify', '2026-01-01', 1199, 1],
    ] as const
  ).map(([name, month, cents, day], i) => ({ id: `plan${i}`, category_id: idOf(name), effective_month: month, planned_cents: cents, due_day: day })),
  month_balances: [
    { id: 'mb1', month: '2026-09-01', starting_balance_cents: 324050 },
    { id: 'mb2', month: '2026-08-01', starting_balance_cents: -41275 },
    { id: 'mb0', month: '2026-01-01', starting_balance_cents: 412500 },
  ],
  pay_schedules: [
    { id: 'ps1', user_id: 'u1', category_id: idOf('Income 1'), first_pay_date: '2026-09-11', frequency: 'biweekly' },
    { id: 'ps2', user_id: 'u1', category_id: idOf('Side Hustle'), first_pay_date: '2026-01-25', frequency: 'monthly' },
  ],
  debts: [
    { id: 'd1', name: 'Car loan', starting_balance_cents: 840_000, minimum_payment_cents: 25_000, apr_basis_points: 1_399, start_date: '2026-01-01', sort_order: 0 },
    { id: 'd2', name: 'Line of credit', starting_balance_cents: 300_000, minimum_payment_cents: 15_000, apr_basis_points: 1_250, start_date: '2026-03-01', sort_order: 1 },
    { id: 'd3', name: 'Student loan', starting_balance_cents: 1_250_000, minimum_payment_cents: 18_000, apr_basis_points: 550, start_date: '2025-09-01', sort_order: 2 },
    { id: 'd4', name: 'Store card', starting_balance_cents: 95_000, minimum_payment_cents: 6_000, apr_basis_points: 2_999, start_date: '2026-05-01', sort_order: 3 },
  ],
  debt_extra_payments: [{ id: 'x1', user_id: 'u1', debt_id: 'd3', month: '2026-06-01', amount_cents: 50_000 }],
  ingest_candidates: [
    pend('p1', '2026-09-21', -1349, 'LITWARE COFFEE'),
    pend('p2', '2026-09-22', -8900, 'ADVENTURE WORKS'),
    pend('p3', '2026-09-22', -2275, 'PROSEWARE BOOKS'),
  ],
  ingest_batches: [
    { id: 'b1', source: 'card_pdf', created_at: '2026-09-09T10:00:00Z', period_end: '2026-09-07' },
    { id: 'b0', source: 'card_csv', created_at: '2026-07-02T10:00:00Z', period_end: null },
  ],
  ingest_unreadable_lines: [
    { id: 'u1', batch_id: 'b1', source_line: 4, reason: 'unparseable_amount' },
    { id: 'u2', batch_id: 'b1', source_line: 12, reason: 'missing_date' },
    { id: 'u3', batch_id: 'b0', source_line: 7, reason: 'invalid_merchant' },
    { id: 'u4', batch_id: 'b1', source_line: 9, reason: 'missing_amount', dismissed_at: '2026-09-10T08:00:00Z' },
  ],
  merchant_rules: (
    [
      ['r91', 'CORNER MARKET ANYTOWN AB', 'Groceries'], ['r92', 'NORTHWIND DINER ANYTOWN AB', 'Restaurants'],
      ['r93', 'CONTOSO FUEL #221 ANYTOWN AB', 'Gas'], ['r94', 'STREAMFLIX', 'Netflix'], ['r95', 'LUCERNE CINEMAS', 'Movie Theater'],
    ] as const
  ).map(([id, shop, cat]) => ({ id, match_merchant: shop, category_id: idOf(cat) })),
})
fake.user.user_metadata.display_name = 'Sam'
// What the two writing functions answer: a statement's save with invented
// counts, as 0003's function does, and a typed charge with nothing, as
// 0023's does. The fake keeps no rows from either; the test reads the
// call it recorded instead.
fake.rpcReplies['save_import'] = [{ batch_id: 'b9', parsed: 20, deduped: 0, inserted: 20, rejected: 0, auto_approved: 0 }]
fake.rpcReplies['add_typed_transaction'] = null
// ?aioff: the owner has AI switched off, in the stored choice and in the helper's status.
if (location.search.includes('aioff')) {
  fake.tables.ai_settings.push({ user_id: fake.user.id, enabled: false })
  fake.functions.aiStatus = { ...fake.functions.aiStatus, enabled: false }
}
await fake.signIn()
Object.assign(window, { __preview: fake })

export function createSupabase() {
  return fake.client
}
export type { SupabaseClient } from '@supabase/supabase-js'
// Mirrors src/supabase.ts's non-client exports, which the app imports from the same module.
export { sessionKeyOf, SIGNED_OUT_HERE_ONLY } from '../src/supabase.js'
