/**
 * Statement text to `IsoDate`, declared rather than sniffed.
 *
 * `03/04/2025` is the 3rd of April in London and the 4th of March in New York.
 * Nothing in the string says which. Getting it wrong moves a transaction into
 * the wrong month and the wrong week, which is every figure the app shows.
 *
 * So the format is a parameter, and `dateFormatCandidates` exists to tell the
 * caller when a column genuinely cannot be resolved from its contents — the
 * importer asks the user instead of picking one.
 */
import { type IsoDate, isoDate } from '@budget/money-primitives'
import type { ParseOutcome } from './amount.js'

export type DateFormat =
  | 'YYYY-MM-DD'
  | 'MM/DD/YYYY'
  | 'DD/MM/YYYY'
  | 'MM/DD/YY'
  | 'DD/MM/YY'

export const DATE_FORMATS: readonly DateFormat[] = [
  'YYYY-MM-DD',
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'MM/DD/YY',
  'DD/MM/YY',
]

/**
 * POSIX's two-digit year pivot: 00-68 is this century, 69-99 the last.
 *
 * A card statement is never from 1969, but a predictable published rule beats
 * a bespoke one, and a 1969 date is visibly absurd in the review queue where
 * a silently-wrong 2069 would not be.
 */
const TWO_DIGIT_PIVOT = 69

const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
/** Slash formats also appear dash-separated; the separator carries no meaning. */
const SLASHED = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/

export function parseStatementDate(raw: string, format: DateFormat): ParseOutcome<IsoDate> {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'missing_date' }

  const parts = extractParts(trimmed, format)
  if (parts === null) return { ok: false, reason: 'unparseable_date' }

  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  try {
    // isoDate rejects a day that does not exist in that month, so 31/02 fails
    // here rather than silently becoming the 3rd of March.
    return { ok: true, value: isoDate(`${pad(parts.y, 4)}-${pad(parts.m)}-${pad(parts.d)}`) }
  } catch {
    // Swallows the RangeError deliberately: its message quotes the input.
    return { ok: false, reason: 'unparseable_date' }
  }
}

interface DateParts {
  readonly y: number
  readonly m: number
  readonly d: number
}

function extractParts(value: string, format: DateFormat): DateParts | null {
  if (format === 'YYYY-MM-DD') {
    const m = ISO.exec(value)
    if (!m) return null
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) }
  }

  const m = SLASHED.exec(value)
  if (!m) return null

  const first = Number(m[1])
  const second = Number(m[2])
  const rawYear = m[3] as string

  const expectsTwoDigitYear = format.endsWith('YY') && !format.endsWith('YYYY')
  if (expectsTwoDigitYear !== (rawYear.length === 2)) return null

  const y =
    rawYear.length === 2
      ? Number(rawYear) < TWO_DIGIT_PIVOT
        ? 2000 + Number(rawYear)
        : 1900 + Number(rawYear)
      : Number(rawYear)

  const dayFirst = format.startsWith('DD')
  return dayFirst ? { y, m: second, d: first } : { y, m: first, d: second }
}

/**
 * Which formats are consistent with every sample in a column.
 *
 * The importer uses this to decide whether it may choose or must ask. A column
 * holding `13/04/2025` can only be day-first, and one holding both `13/04` and
 * `04/13` is not a single format at all. But a column where every day happens
 * to be 12 or lower stays genuinely ambiguous however many rows it has, and
 * this returns both — a caller that picks one is guessing.
 *
 * A cell that no format can read is ignored rather than fatal. A header row
 * that slipped through, a footer total, or a single `n/a` posting date says
 * nothing about the column's format, and each is rejected on its own merits
 * later with its own queue reason. Letting one eliminate every format would
 * tell the importer a perfectly good date column is not a date column.
 *
 * But a column where most cells are unreadable is not a date column that has a
 * few gaps — it is a merchant column with one cell that happens to look like a
 * date. So a majority of the non-blank samples must be readable before any
 * format is offered.
 */
export function dateFormatCandidates(samples: readonly string[]): readonly DateFormat[] {
  const usable = samples.filter((s) => s.trim().length > 0)
  if (usable.length === 0) return []

  let viable: readonly DateFormat[] | null = null
  let readable = 0

  for (const sample of usable) {
    const forSample = DATE_FORMATS.filter((format) => parseStatementDate(sample, format).ok)
    if (forSample.length === 0) continue
    readable++
    viable = viable === null ? forSample : viable.filter((format) => forSample.includes(format))
  }

  if (viable === null) return []
  // Ties count as a majority: two readable cells out of four is still a column
  // worth offering, where one out of four is noise.
  if (readable * 2 < usable.length) return []
  return viable
}
