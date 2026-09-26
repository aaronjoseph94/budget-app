import { isoDate } from '@budget/money-primitives'
import type { PeriodCategory, ShopEntry } from '../src/index.js'

/**
 * The lists and rows the shop tests share (F38, F39, F41). Each row names
 * its shop as the app hands it over: statement-parsers' normalised key.
 */
export const CATEGORIES: readonly PeriodCategory[] = [
  { id: 'pay', name: 'Paycheck', kind: 'income', sortOrder: 1 },
  { id: 'rent', name: 'Rent', kind: 'bill', sortOrder: 2 },
  { id: 'music', name: 'Music', kind: 'subscription', sortOrder: 3 },
  { id: 'loan', name: 'Car loan', kind: 'debt', sortOrder: 4 },
  { id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 5 },
  { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 6 },
  { id: 'fund', name: 'Flight fund', kind: 'savings', sortOrder: 7 },
  { id: 'card', name: 'Card payment', kind: 'transfer', sortOrder: 8 },
]

let next = 0

/** One row: `dollars` below 0 is a charge, above 0 a refund. Ids count up, so a later row sorts later on its day. */
export function row(date: string, dollars: number, shop: string, categoryId = 'dining', by: ShopEntry['by'] = 'statement'): ShopEntry {
  next += 1
  return { id: `r${String(next).padStart(4, '0')}`, postedOn: isoDate(date), amountCents: Math.round(dollars * 100), categoryId, shop, by }
}

/** The same charge on each date. */
export function charges(dates: readonly string[], dollars: number, shop: string, categoryId = 'dining'): ShopEntry[] {
  return dates.map((d) => row(d, dollars, shop, categoryId))
}
