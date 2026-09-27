/**
 * One typed line, such as "coffee 4.50 yesterday", read into the typed
 * form's fields (plan A22, F47).
 *
 * It fills a field only when the words settle it, and leaves the rest
 * empty: for the owner, or for the AI, whose amount must then appear word
 * for word in the same line (ADR 0005 §7). Nothing here saves anything; the
 * form still waits for its button.
 *
 * NOTHING IS GUESSED, as in the rest of this package. Two numbers that
 * could each be the amount leave the amount empty, never the larger; a date
 * with slashes is September in one country and October in another, so it
 * leaves the day empty; a year is never assumed to be last year.
 *
 * Deliberately no `Date`, as in yearless-dates.ts: a date built in a browser
 * west of UTC can arrive a day earlier than it left.
 */
import { addDays, type Cents, type IsoDate } from '@budget/money-primitives'
import { parseAmountToCents, US_AMOUNT_FORMAT } from './amount.js'
import { daysFromCivil, daysInMonth, isoDate } from './formats/yearless-dates.js'
import { normalizeMerchant } from './merchant.js'

export interface QuickEntryInput {
  readonly text: string
  /** Today, which "today", "yesterday" and a weekday count from. */
  readonly asOf: IsoDate
  /** Learned rules: a shop's tidied name to its category's id, as `merchant_rules` holds them. */
  readonly rules: ReadonlyMap<string, string>
}

export interface QuickEntry {
  /** The amount without its sign, or null when no number, or more than one, could be it. */
  readonly amount: Cents | null
  /** The day it happened: today when nothing was said, null when what was said cannot be read. */
  readonly date: IsoDate | null
  readonly flow: 'spent' | 'received'
  /** Whether the line said which way the money went, rather than spent by default. */
  readonly flowSaid: boolean
  /** The owner's own words for what it was, or null when none are left. */
  readonly shop: string | null
  /** The category a learned rule gives the shop, or null. */
  readonly categoryId: string | null
}

interface Word {
  readonly raw: string
  /** Lower case, with the punctuation a sentence puts after a word taken off. */
  readonly low: string
  used: boolean
}

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
}
/** Full names only: "sun", "sat" and "wed" are words in shop names too. Sunday is 0. */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_OF_MONTH = /^(\d{1,2})(?:st|nd|rd|th)?$/
const YEAR = /^\d{4}$/
const ISO = /^\d{4}-\d{2}-\d{2}$/
const SLASHED = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/
const MONEY = /^\$?\d[\d,]*(?:\.\d{1,2})?\$?$/
const DOLLAR_WORDS = new Set(['dollars', 'dollar', 'bucks'])
const RECEIVED = new Set(['received', 'earned', 'refund', 'refunded'])
/** Taken off either end of what is left, so "spent 12 on lunch" is "lunch". */
const FILLERS = new Set(['i', 'spent', 'paid', 'bought', 'on', 'at', 'for', 'from', 'to', 'with'])

export function parseQuickEntry(input: QuickEntryInput): QuickEntry {
  const words: Word[] = input.text
    .normalize('NFKC')
    .split(/\s+/u)
    .filter((w) => w.length > 0)
    .map((raw) => ({ raw, low: raw.toLowerCase().replace(/[,;:!?]+$/u, '').replace(/\.$/u, ''), used: false }))

  const date = readDate(words, input.asOf)
  const amount = readAmount(words)
  const flowSaid = readFlow(words)
  const shop = readShop(words)
  const categoryId = shop === null ? null : (input.rules.get(normalizeMerchant(shop)) ?? null)
  return { amount, date, flow: flowSaid ? 'received' : 'spent', flowSaid, shop, categoryId }
}

/** Every day the line names; one day, today when none, or null when they disagree or one cannot be read. */
function readDate(words: Word[], asOf: IsoDate): IsoDate | null {
  const said: (IsoDate | null)[] = []
  const take = (from: number, count: number, day: IsoDate | null) => {
    for (let k = from; k < from + count; k++) (words[k] as Word).used = true
    said.push(day !== null && day > asOf ? null : day)
  }
  words.forEach((w, i) => {
    if (w.used) return
    const next = words[i + 1]
    if (w.low === 'today') return take(i, 1, asOf)
    if (w.low === 'yesterday') return take(i, 1, addDays(asOf, -1))
    if (ISO.test(w.low)) return take(i, 1, validDate(...(w.low.split('-').map(Number) as [number, number, number])))
    if (SLASHED.test(w.low)) return take(i, 1, null)
    if (w.low === 'last' && next !== undefined && WEEKDAYS.includes(next.low)) return take(i, 2, weekday(asOf, next.low, false))
    if (WEEKDAYS.includes(w.low)) return take(i, 1, weekday(asOf, w.low, true))
    const month = MONTHS[w.low]
    if (month === undefined) return
    const after = DAY_OF_MONTH.exec(next?.low ?? '')
    const before = DAY_OF_MONTH.exec(words[i - 1]?.used === false ? (words[i - 1] as Word).low : '')
    const day = after ?? before
    if (day === null) return
    const start = after !== null ? i : i - 1
    const yearWord = words[start + 2]
    const year = yearWord !== undefined && !yearWord.used && YEAR.test(yearWord.low) ? Number(yearWord.low) : null
    take(start, year === null ? 2 : 3, validDate(year ?? Number(asOf.slice(0, 4)), month, Number(day[1])))
  })
  if (said.length === 0) return asOf
  const first = said[0] ?? null
  return said.every((d) => d === first) ? first : null
}

function validDate(y: number, m: number, d: number): IsoDate | null {
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m) ? isoDate(y, m, d) : null
}

/** The latest such weekday, today counted when `today` is true. */
function weekday(asOf: IsoDate, name: string, today: boolean): IsoDate {
  const [y, m, d] = asOf.split('-').map(Number) as [number, number, number]
  // 1970-01-01, day 0, was a Thursday.
  const todays = (((daysFromCivil(y, m, d) + 4) % 7) + 7) % 7
  const back = (todays - WEEKDAYS.indexOf(name) + 7) % 7
  return addDays(asOf, back === 0 && !today ? -7 : -back)
}

/** The one number that is the amount, or null (F47). */
function readAmount(words: Word[]): Cents | null {
  const found: { word: Word; index: number; cents: Cents }[] = []
  words.forEach((word, index) => {
    if (word.used || !MONEY.test(word.low)) return
    const read = parseAmountToCents(word.low, US_AMOUNT_FORMAT)
    if (read.ok && read.value > 0) found.push({ word, index, cents: read.value })
  })
  const marked = found.filter((f) => f.word.low.includes('$'))
  const withCents = found.filter((f) => f.word.low.includes('.'))
  const pool = marked.length > 0 ? marked : withCents.length > 0 ? withCents : found
  const only = pool.length === 1 ? pool[0] : undefined
  if (only === undefined) return null
  only.word.used = true
  const next = words[only.index + 1]
  if (next !== undefined && DOLLAR_WORDS.has(next.low)) next.used = true
  return only.cents
}

/** Whether the line says the money came in; its words are used up either way. */
function readFlow(words: Word[]): boolean {
  let received = false
  words.forEach((w, i) => {
    const next = words[i + 1]
    if (w.used) return
    if (RECEIVED.has(w.low)) {
      w.used = true
      received = true
    } else if ((w.low === 'got' || w.low === 'was') && next !== undefined && !next.used && next.low === 'paid') {
      w.used = true
      next.used = true
      received = true
    }
  })
  return received
}

function readShop(words: readonly Word[]): string | null {
  const left = words.filter((w) => !w.used)
  while (left.length > 0 && FILLERS.has((left[0] as Word).low)) left.shift()
  while (left.length > 0 && FILLERS.has((left[left.length - 1] as Word).low)) left.pop()
  const shop = left.map((w) => w.raw.replace(/[,;:]+$/u, '')).join(' ').trim()
  return shop.length === 0 ? null : shop
}
