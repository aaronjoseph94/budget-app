/**
 * Subscriptions: which charges repeat, how often, what a year of each
 * costs, and when a price changed (F38, docs/formula-decisions.md; plan
 * §2.6, §7).
 *
 * The workbook's Bills tab holds what the owner types; it never reads a
 * statement for a pattern, so nothing here has a cached value, and the
 * tests are worked by hand. A pattern is called only when every gap falls
 * in one band and the amounts hold steady, so a shop visited now and then
 * is never mistaken for a plan.
 */
import { type Cents, type IsoDate, addDays, cents, daysBetween } from '@budget/money-primitives'
import { type ShopRow, type ShopRowsInput, coveredFrom, shopRows } from './shops.js'
import { median } from './stats.js'

export type Cadence = 'weekly' | 'fortnightly' | 'monthly' | 'yearly'

/** Each band's gaps in days, ends included, and how many charges make a year. */
export const CADENCE_BANDS: Readonly<Record<Cadence, { readonly min: number; readonly max: number; readonly perYear: number }>> = {
  weekly: { min: 6, max: 8, perYear: 52 },
  fortnightly: { min: 12, max: 16, perYear: 26 },
  monthly: { min: 26, max: 35, perYear: 12 },
  yearly: { min: 350, max: 380, perYear: 1 },
}
const CADENCES = Object.keys(CADENCE_BANDS) as readonly Cadence[]

export interface RecurringInput extends ShopRowsInput {
  readonly asOf: IsoDate
  /** Shops the owner marked "Not a subscription": never a series. */
  readonly notSubscriptions: readonly string[]
}

export interface PriceChange {
  readonly beforeCents: Cents
  readonly nowCents: Cents
  readonly direction: 'up' | 'down'
}

export interface RecurringCharge {
  readonly shop: string
  /** Where the latest charge is filed. */
  readonly categoryId: string
  readonly cadence: Cadence
  readonly charges: number
  readonly first: IsoDate
  readonly last: IsoDate
  readonly lastId: string
  /** Of every charge in the series. */
  readonly medianCents: Cents
  /** The latest charge when a price changed, else the median. */
  readonly priceCents: Cents
  /** The median gap, half-up. */
  readonly gapDays: number
  readonly next: IsoDate
  readonly yearCents: Cents
  /** A year's ÷ 12, half-up. */
  readonly monthCents: Cents
  readonly priceChange: PriceChange | null
  readonly isNew: boolean
}

const MIN_CHARGES = 3
const NEW_WITHIN_DAYS = 100

/** F38: every shop whose charges repeat in one band, dearest a year first. */
export function recurringCharges(input: RecurringInput): { readonly series: readonly RecurringCharge[] } {
  const skip = new Set(input.notSubscriptions)
  const byShop = new Map<string, ShopRow[]>()
  for (const r of shopRows(input)) {
    if (!r.charge || r.postedOn > input.asOf || skip.has(r.shop)) continue
    byShop.set(r.shop, [...(byShop.get(r.shop) ?? []), r])
  }
  const from = coveredFrom(input)
  const series = [...byShop.values()].flatMap((rows) => {
    const found = seriesOf(rows, input.asOf, from)
    return found === null ? [] : [found]
  })
  return { series: series.sort((a, b) => b.yearCents - a.yearCents || (a.shop < b.shop ? -1 : 1)) }
}

function seriesOf(rows: readonly ShopRow[], asOf: IsoDate, from: IsoDate | null): RecurringCharge | null {
  if (rows.length < MIN_CHARGES || from === null) return null
  const gaps = rows.slice(1).map((r, i) => daysBetween(rows[i]!.postedOn, r.postedOn))
  const cadence = CADENCES.find((c) => gaps.every((g) => g >= CADENCE_BANDS[c].min && g <= CADENCE_BANDS[c].max))
  if (cadence === undefined) return null
  const band = CADENCE_BANDS[cadence]
  const first = rows[0]!
  const last = rows[rows.length - 1]!
  // Stopped: the longest gap has passed with no charge.
  if (daysBetween(last.postedOn, asOf) > band.max) return null

  const sizes = rows.map((r) => r.sizeCents)
  const earlier = sizes.slice(0, -1)
  const steady = whole(median({ values: earlier }))
  // max(100 cents, 10% of the median, half-up).
  const tolerance = Math.max(100, Number((BigInt(steady) + 5n) / 10n))
  if (earlier.some((s) => Math.abs(s - steady) > tolerance)) return null
  const previous = earlier[earlier.length - 1]!
  const latest = last.sizeCents
  const change = priceChange(previous, latest)
  // The latest is judged apart, so a rise past 10% still shows; past half the charge before, it is another purchase.
  const inside = Math.abs(latest - steady) <= tolerance || (change !== null && 2 * Math.abs(latest - previous) <= previous)
  if (!inside) return null

  const medianCents = cents(whole(median({ values: sizes })))
  const priceCents = change === null ? medianCents : latest
  const gapDays = whole(median({ values: gaps }))
  const yearCents = cents(priceCents * band.perYear)
  return {
    shop: last.shop,
    categoryId: last.categoryId,
    cadence,
    charges: rows.length,
    first: first.postedOn,
    last: last.postedOn,
    lastId: last.id,
    medianCents,
    priceCents,
    gapDays,
    next: addDays(last.postedOn, gapDays),
    yearCents,
    monthCents: cents(Number((BigInt(yearCents) * 2n + 12n) / 24n)),
    priceChange: change,
    isNew: daysBetween(first.postedOn, asOf) <= NEW_WITHIN_DAYS && daysBetween(from, first.postedOn) >= band.max,
  }
}

/** At least 50 cents and at least 2% of the charge before: |latest − previous| × 50 ≥ previous. */
function priceChange(previous: Cents, latest: Cents): PriceChange | null {
  const moved = Math.abs(latest - previous)
  if (moved < 50 || moved * 50 < previous) return null
  return { beforeCents: previous, nowCents: latest, direction: latest > previous ? 'up' : 'down' }
}

/** Every list here has at least one value, so it has a median. */
function whole(value: number | null): number {
  if (value === null) throw new RangeError('A series has no charges to take a median of')
  return value
}
