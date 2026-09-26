/**
 * Unusual charges: one far above its category's usual, a large first
 * charge at a new shop, the same charge twice, and a typed charge a
 * statement also holds (F39, docs/formula-decisions.md; plan §2.6, §7).
 *
 * Each is flagged, never hidden: nothing here removes a row or leaves one
 * out of a total. Keeping a duplicate import out is the dedupe hash's job;
 * this only says what looks worth a second look. No workbook cell; the
 * tests are worked by hand.
 */
import { type Cents, type IsoDate, addDays, cents, daysBetween } from '@budget/money-primitives'
import type { DateWindow } from './compare.js'
import { type ShopEntry, type ShopRow, type ShopRowsInput, NEW_AFTER_DAYS, coveredFrom, spendingRows } from './shops.js'
import { median } from './stats.js'

export interface UnusualInput extends ShopRowsInput {
  /** The charges looked at: the Coach's last 30 days, or the month Shops shows. */
  readonly window: DateWindow
}

export interface FlaggedCharge {
  readonly id: string
  readonly postedOn: IsoDate
  readonly shop: string
  readonly categoryId: string
  readonly by: ShopEntry['by']
  /** Its size, without the sign. */
  readonly amountCents: Cents
}

export interface LargeCharge extends FlaggedCharge {
  /** The median of the category's charges in the 90 days before. */
  readonly usualCents: Cents
  /** max(5000, 3 × usual). */
  readonly thresholdCents: Cents
  /** How many charges that median rests on. */
  readonly earlier: number
}

/** Two charges of one amount, the earlier first (by date, then id). */
export interface ChargePair {
  /** The shop to name it by: the statement row's, since a typed name is the owner's shorthand; '' when neither has one. */
  readonly shop: string
  readonly amountCents: Cents
  readonly first: FlaggedCharge
  readonly second: FlaggedCharge
}

export interface UnusualCharges {
  readonly large: readonly LargeCharge[]
  readonly newShop: readonly FlaggedCharge[]
  readonly doubles: readonly ChargePair[]
  readonly countedTwice: readonly ChargePair[]
}

const LOOK_BACK_DAYS = 90
const MIN_EARLIER = 5
const LARGE_FLOOR = 5000
const NEW_SHOP_FLOOR = 10_000
const PAIR_DAYS = 3

export function unusualCharges(input: UnusualInput): UnusualCharges {
  const rows = spendingRows(input)
  const charges = rows.filter((r) => r.charge)
  const inWindow = (r: ShopRow) => r.postedOn >= input.window.from && r.postedOn <= input.window.to
  const from = coveredFrom(input)
  const large: LargeCharge[] = []
  const newShop: FlaggedCharge[] = []
  for (const c of charges) {
    if (!inWindow(c) || c.shop === '') continue
    const judged = largeCharge(c, charges)
    if (judged !== null) large.push(judged)
    else if (from !== null && isNewShop(c, rows, from)) newShop.push(flagged(c))
  }

  const doubles: ChargePair[] = []
  const countedTwice: ChargePair[] = []
  charges.forEach((b, j) => {
    if (!inWindow(b)) return
    // Earlier charges no more than 3 days before, nearest first.
    for (let i = j - 1; i >= 0 && daysBetween(charges[i]!.postedOn, b.postedOn) <= PAIR_DAYS; i--) {
      const a = charges[i]!
      if (a.sizeCents !== b.sizeCents) continue
      const pair = { shop: pairShop(a, b), amountCents: b.sizeCents, first: flagged(a), second: flagged(b) }
      // A pair that is both says more as counted twice.
      if (a.by !== b.by) countedTwice.push(pair)
      else if (a.shop !== '' && a.shop === b.shop) doubles.push(pair)
    }
  })
  const bySecond = (x: ChargePair, y: ChargePair) =>
    x.second.postedOn < y.second.postedOn ? -1 : x.second.postedOn > y.second.postedOn ? 1 : x.second.id < y.second.id ? -1 : x.second.id > y.second.id ? 1 : x.first.id < y.first.id ? -1 : 1
  return { large, newShop, doubles: doubles.sort(bySecond), countedTwice: countedTwice.sort(bySecond) }
}

/** At least max(5000, 3 × the median of 5 or more of its category's charges in the 90 days before). */
function largeCharge(c: ShopRow, charges: readonly ShopRow[]): LargeCharge | null {
  const since = addDays(c.postedOn, -LOOK_BACK_DAYS)
  const earlier = charges.filter((e) => e.categoryId === c.categoryId && e.postedOn >= since && e.postedOn < c.postedOn).map((e) => e.sizeCents)
  const usual = median({ values: earlier })
  if (earlier.length < MIN_EARLIER || usual === null) return null
  const thresholdCents = cents(Math.max(LARGE_FLOOR, 3 * usual))
  return c.sizeCents >= thresholdCents ? { ...flagged(c), usualCents: cents(usual), thresholdCents, earlier: earlier.length } : null
}

/** $100.00 or more, 60 days or more into the records, with no earlier row of the shop, a refund included. */
function isNewShop(c: ShopRow, rows: readonly ShopRow[], from: IsoDate): boolean {
  if (c.sizeCents < NEW_SHOP_FLOOR || daysBetween(from, c.postedOn) < NEW_AFTER_DAYS) return false
  return !rows.some((r) => r.shop === c.shop && (r.postedOn < c.postedOn || (r.postedOn === c.postedOn && r.id < c.id)))
}

function pairShop(a: ShopRow, b: ShopRow): string {
  const named = [b, a].find((c) => c.by === 'statement' && c.shop !== '') ?? [a, b].find((c) => c.shop !== '')
  return named === undefined ? '' : named.shop
}

function flagged(r: ShopRow): FlaggedCharge {
  return { id: r.id, postedOn: r.postedOn, shop: r.shop, categoryId: r.categoryId, by: r.by, amountCents: r.sizeCents }
}
