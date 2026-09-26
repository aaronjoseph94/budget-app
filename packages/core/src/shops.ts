/**
 * Shops: what the owner spent at each one, against last month (F41,
 * docs/formula-decisions.md; plan §2.6, §7), and the rows F38's
 * subscriptions and F39's unusual charges read.
 *
 * A shop is the statement's descriptor as statement-parsers normalises it.
 * The app hands that key over with each row, as data, so the engine never
 * imports a parser. The workbook names no shops, so nothing here has a
 * cached value; the tests are worked by hand.
 */
import { type Cents, type IsoDate, cents, daysBetween } from '@budget/money-primitives'
import { type Change, type DateWindow, change, comparisonWindow } from './compare.js'
import type { PeriodCategory } from './period-sheet.js'
import { SPENDING_LISTS } from './week.js'

/** One ledger row, with its shop. */
export interface ShopEntry {
  readonly id: string
  readonly postedOn: IsoDate
  /** Below 0 is money out. */
  readonly amountCents: number
  readonly categoryId: string
  /** statement-parsers' normalizeMerchant of the row's descriptor; '' for none. */
  readonly shop: string
  /** Typed in Add or read from a receipt photo ('hand'), or from a card statement. */
  readonly by: 'hand' | 'statement'
}

/** A row on a spending list with a shop, inside the records covered (F38). */
export interface ShopRow extends ShopEntry {
  /** The charge's size: the amount without its sign, 0 for a refund. */
  readonly sizeCents: Cents
  readonly charge: boolean
}

export interface ShopRowsInput {
  readonly historyStart: IsoDate | null
  /** The first day `entries` covers. */
  readonly readFrom: IsoDate
  readonly categories: readonly Pick<PeriodCategory, 'id' | 'kind'>[]
  readonly entries: readonly ShopEntry[]
}

/** The later of history start and the first day read; null with no records (F38). */
export function coveredFrom(input: Pick<ShopRowsInput, 'historyStart' | 'readFrom'>): IsoDate | null {
  if (input.historyStart === null) return null
  return input.historyStart > input.readFrom ? input.historyStart : input.readFrom
}

/**
 * Every row on a spending list inside the records covered, oldest first by
 * date, then id: charges and refunds both, since a shop's spending is net
 * (F41) and a new shop has no earlier row of either (F39). A row with no
 * shop is here too, for a category's usual charge (F39).
 */
export function spendingRows(input: ShopRowsInput): readonly ShopRow[] {
  const from = coveredFrom(input)
  if (from === null) return []
  const spending = new Set(input.categories.filter((c) => SPENDING_LISTS.includes(c.kind)).map((c) => c.id))
  return input.entries
    .filter((e) => e.amountCents !== 0 && spending.has(e.categoryId) && e.postedOn >= from)
    .map((e) => ({ ...e, sizeCents: cents(e.amountCents < 0 ? -e.amountCents : 0), charge: e.amountCents < 0 }))
    .sort(byDateThenId)
}

/** As spendingRows, only the rows that name a shop. */
export function shopRows(input: ShopRowsInput): readonly ShopRow[] {
  return spendingRows(input).filter((r) => r.shop !== '')
}

export function byDateThenId(a: ShopEntry, b: ShopEntry): number {
  return a.postedOn < b.postedOn ? -1 : a.postedOn > b.postedOn ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export interface TopShopsInput extends ShopRowsInput {
  readonly asOf: IsoDate
  /** Any day of the month shown. */
  readonly month: IsoDate
}

export interface ShopTotal {
  readonly shop: string
  /** Charges less refunds in the window shown. */
  readonly nowCents: Cents
  readonly charges: number
}

export interface TopShop extends ShopTotal {
  /** Against the window before (F26); null when that starts before the records (F24). */
  readonly before: Change | null
}

export type TopShops =
  | { readonly status: 'not_started' }
  | {
      readonly status: 'ready'
      readonly now: DateWindow
      /** Null when it starts before the records. */
      readonly before: DateWindow | null
      /** At most 10, largest first. */
      readonly shops: readonly TopShop[]
      /** At most 10, largest first; null when the records begin under 60 days before the month. */
      readonly newShops: readonly ShopTotal[] | null
    }

const TOP = 10
/** F39's and F41's: a shop is new only with this many days of records before. */
export const NEW_AFTER_DAYS = 60

/** F41: each shop's month so far, or whole month, against the same days before. */
export function topShops(input: TopShopsInput): TopShops {
  const window = comparisonWindow({ period: 'month', month: input.month, asOf: input.asOf, historyStart: input.historyStart })
  if (window.status === 'not_started') return { status: 'not_started' }
  const { now } = window
  const before = window.status === 'compared' ? window.before : null
  const rows = shopRows(input)
  const netIn = (w: DateWindow) => totals(rows.filter((r) => r.postedOn >= w.from && r.postedOn <= w.to))
  const shown = [...netIn(now).values()].filter((t) => t.nowCents > 0).sort((a, b) => b.nowCents - a.nowCents || (a.shop < b.shop ? -1 : 1))
  const earlier = before === null ? null : netIn(before)
  const shops = shown.slice(0, TOP).map((t) => {
    if (earlier === null) return { ...t, before: null }
    // No row at the shop in the window before is a real $0 there, inside the records.
    const was = earlier.get(t.shop)
    return { ...t, before: change(t.nowCents, was === undefined ? cents(0) : was.nowCents, false) }
  })

  const from = coveredFrom(input)
  let newShops: ShopTotal[] | null = null
  if (from !== null && daysBetween(from, now.from) >= NEW_AFTER_DAYS) {
    const seen = new Set(rows.filter((r) => r.postedOn < now.from).map((r) => r.shop))
    const charged = new Set(rows.filter((r) => r.charge && r.postedOn >= now.from && r.postedOn <= now.to).map((r) => r.shop))
    newShops = shown.filter((t) => charged.has(t.shop) && !seen.has(t.shop)).slice(0, TOP)
  }
  return { status: 'ready', now, before, shops, newShops }
}

/** Each shop's net and charges over the rows given. */
function totals(rows: readonly ShopRow[]): Map<string, ShopTotal> {
  const out = new Map<string, ShopTotal>()
  for (const r of rows) {
    const was = out.get(r.shop) ?? { shop: r.shop, nowCents: cents(0), charges: 0 }
    out.set(r.shop, { shop: r.shop, nowCents: cents(was.nowCents - r.amountCents), charges: was.charges + (r.charge ? 1 : 0) })
  }
  return out
}
