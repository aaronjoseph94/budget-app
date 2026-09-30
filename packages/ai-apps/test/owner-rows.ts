/**
 * One owner's rows around September 2026, as ai_app_read answers them, for
 * the read tools' tests (PLAN §2.13, mcp-read-tools). Every figure those
 * tests expect is worked by hand from these rows, and core, not mocked,
 * must give it. The owner's today is Wednesday 30 September 2026.
 */
export const READ = {
  today: '2026-09-30',
  categories: [
    { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
    { id: 'pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
    { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
  ],
  budgets: [{ id: 'b1', category_id: 'food', month: '2026-09-01', applies: 'onward', budget_cents: 60000 }],
  plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-01-01', planned_cents: 120000, due_day: 1 }],
  txns: [
    { id: 't6', posted_on: '2026-10-02', amount_cents: -2000, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
    { id: 't4', posted_on: '2026-09-30', amount_cents: 50000, merchant_raw: 'PAYMENT', category_id: 'card', source: 'card_csv' },
    { id: 't3', posted_on: '2026-09-29', amount_cents: -1275, merchant_raw: 'FRESHCO', category_id: 'food', source: 'ai_app' },
    { id: 't2', posted_on: '2026-09-15', amount_cents: 250000, merchant_raw: 'PAYROLL', category_id: 'pay', source: 'typed' },
    { id: 't1', posted_on: '2026-09-02', amount_cents: -4520, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
    { id: 't0', posted_on: '2026-08-31', amount_cents: -999, merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' },
  ],
  balances: [{ month: '2026-09-01', starting_balance_cents: 100000 }],
  schedules: [],
  records: { statement_start: '2026-08-08', statement_end: '2026-09-07', first_entry: '2026-08-31' },
  pending: ['2026-08-31', '2026-09-10', '2026-09-29', '2026-10-01'],
}
