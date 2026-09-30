/**
 * Four years of one owner's rows, 2023 to 2026, and a fake database that
 * answers ai_app_read over them either as 0020's SQL does (each dated part
 * cut to the window the tool asked for) or with every row. PLAN §2.4's
 * window-invariance test runs each read tool both ways: a window too narrow
 * would feed core fewer rows and change a figure. Rows are invented.
 */
import { addDays, isoDate } from '@budget/money-primitives'
import { reply, type Rpc } from './fake-database.js'

type Row = Record<string, unknown>

function everyDay(from: string, to: string, step: number, row: (day: string, i: number) => Row): Row[] {
  const rows: Row[] = []
  for (let day = isoDate(from), i = 0; day <= to; day = addDays(day, step), i++) rows.push(row(day, i))
  return rows
}

const months = everyDay('2023-01-01', '2026-12-31', 1, (day) => ({ day })).filter((r) => String(r.day).endsWith('-01'))
const monthly = (dayOfMonth: string, row: (month: string, i: number) => Row) =>
  months.map((m, i) => row(`${String(m.day).slice(0, 8)}${dayOfMonth}`, i))

const txns = [
  ...everyDay('2023-01-02', '2026-12-30', 3, (d, i) => ({ id: `f${i}`, posted_on: d, amount_cents: -(1234 + (i % 7) * 101), merchant_raw: 'FRESHCO', category_id: 'food', source: 'card_csv' })),
  ...monthly('15', (d, i) => ({ id: `p${i}`, posted_on: d, amount_cents: 250000, merchant_raw: 'PAYROLL', category_id: 'pay', source: 'typed' })),
  ...monthly('20', (d, i) => ({ id: `c${i}`, posted_on: d, amount_cents: 80000 + i, merchant_raw: 'PAYMENT', category_id: 'card', source: 'card_csv' })),
  ...monthly('25', (d, i) => ({ id: `s${i}`, posted_on: d, amount_cents: -(10000 + i * 10), merchant_raw: 'TO SAVINGS', category_id: 'fund', source: 'typed' })),
].sort((a, b) => String(b.posted_on).localeCompare(String(a.posted_on)) || String(a.id).localeCompare(String(b.id)))

/** Everything ai_app_read could return for this owner, whose today is `today`. */
export function fourYears(today: string): Row {
  return {
    today,
    categories: [
      { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
      { id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
      { id: 'rent', name: 'Rent', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
      { id: 'fund', name: 'Trip fund', kind: 'savings', sort_order: 0, weekly_budget_cents: 5000 },
    ],
    budgets: [
      { id: 'b1', category_id: 'food', month: '2023-01-01', applies: 'onward', budget_cents: 50000 },
      { id: 'b2', category_id: 'food', month: '2025-06-01', applies: 'onward', budget_cents: 60000 },
      { id: 'b3', category_id: 'food', month: '2026-09-01', applies: 'only', budget_cents: 55000 },
      { id: 'b4', category_id: 'pay', month: '2024-01-01', applies: 'onward', budget_cents: 250000 },
    ],
    plans: [
      { id: 'r1', category_id: 'rent', effective_month: '2023-01-01', planned_cents: 100000, due_day: 1 },
      { id: 'r2', category_id: 'rent', effective_month: '2026-10-01', planned_cents: 125000, due_day: 1 },
    ],
    txns,
    balances: monthly('01', (d, i) => ({ month: d, starting_balance_cents: 90000 + i * 1000 })),
    schedules: [{ id: 'ps', category_id: 'pay', first_pay_date: '2023-01-15', frequency: 'monthly' }],
    records: { statement_start: '2023-01-08', statement_end: '2026-09-07', first_entry: '2023-01-02' },
    not_subscriptions: ['not_subscription:TO SAVINGS'],
    pending: everyDay('2023-01-05', '2026-12-28', 17, (d) => ({ d })).map((r) => r.d),
  }
}

const between = (from: string, to: string) => (d: unknown) => String(d) >= from && String(d) <= to
const WINDOWED: Record<string, (r: unknown, from: string, to: string) => boolean> = {
  budgets: (r, _, to) => String((r as Row).month) <= to,
  plans: (r, _, to) => String((r as Row).effective_month) <= to,
  txns: (r, from, to) => between(from, to)((r as Row).posted_on),
  balances: (r, from, to) => between(from, to)((r as Row).month),
  pending: (d, from, to) => between(from, to)(d),
}

/** Answers ai_app_read with the parts asked for: cut to the window as the SQL cuts them, or `whole`. */
export function readOf(all: Row, whole: boolean): Rpc {
  return (_fn, args) => {
    const [from, to] = [String(args.p_from), String(args.p_to)]
    const parts = (args.p_parts as string[]).map((p) => {
      const cut = WINDOWED[p]
      const part = all[p]
      return [p, whole || cut === undefined ? part : (part as unknown[]).filter((r) => cut(r, from, to))]
    })
    return reply({ today: all.today, ...Object.fromEntries(parts) })
  }
}
