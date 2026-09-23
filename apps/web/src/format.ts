/**
 * The one place money becomes a string.
 *
 * CLAUDE.md invariant 2 allows exactly one display helper, and this is it.
 * Everywhere else money is integer `Cents`.
 *
 * It formats from the integer directly rather than dividing by 100 first: a
 * division would hand the formatter a float, and the whole point of storing
 * minor units is that no float ever touches an amount.
 */
const GROUPED = new Intl.NumberFormat('en-US')

export function formatCents(amountCents: number): string {
  const negative = amountCents < 0
  const magnitude = Math.abs(amountCents)
  const whole = Math.floor(magnitude / 100)
  const fraction = magnitude % 100
  const body = `$${GROUPED.format(whole)}.${String(fraction).padStart(2, '0')}`
  return negative ? `-${body}` : body
}

/** `2025-03-04` as `4 Mar 2025`. Parsed by parts, never through Date. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatIsoDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  if (year === undefined || month === undefined || day === undefined) return isoDate
  const name = MONTHS[Number(month) - 1]
  if (name === undefined) return isoDate
  return `${Number(day)} ${name} ${year}`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `2026-09` or `2026-09-14` as `September 2026`, the Month screen's title. */
export function formatMonthTitle(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  const name = MONTH_NAMES[Number(month) - 1]
  return year === undefined || name === undefined ? isoDate : `${name} ${year}`
}

/**
 * A rejection code as a sentence a person can act on.
 *
 * CLAUDE.md requires every ingestion failure to reach the review queue with a
 * READABLE reason. The enum is what the database stores and what logs may
 * carry; this is what the user reads. Neither doubles as the other.
 */
const REASONS: Record<string, string> = {
  row_shape_mismatch:
    'This row had a different number of columns than the rest of the file, so the values could not be trusted to line up.',
  missing_amount: 'This row had no amount.',
  missing_date: 'This row had no date.',
  unparseable_amount: 'The amount could not be read as money in the format you chose.',
  unparseable_date: 'The date could not be read in the format you chose.',
  missing_merchant: 'This row had no description.',
  invalid_merchant: 'The description contained characters that could display as something other than what is stored.',
  duplicate_within_batch: 'This row appeared twice in the same file.',
  already_in_ledger: 'You already have this transaction.',
  model_output_invalid: 'The suggestion came back in a form that could not be used.',
  user_rejected: 'You rejected this.',
}

export function describeReason(reason: string): string {
  return REASONS[reason] ?? 'This row could not be read.'
}

/** A file-level failure, which stops the whole import rather than one row. */
const FAILURES: Record<string, string> = {
  unterminated_quote:
    'A quotation mark opens somewhere in this file and never closes, so everything after it reads as one enormous value. Nothing was imported, because the rest of the file cannot be trusted.',
  text_after_closing_quote:
    'A value in this file has text immediately after its closing quotation mark, which is not something a CSV can mean.',
  too_many_rows: 'This file has more rows than the importer will read in one go.',
  field_too_large: 'A single value in this file is far larger than any transaction description should be.',
  invalid_delimiter: 'The column separator is not a single usable character.',
}

export function describeFailure(kind: string, line?: number): string {
  const body = FAILURES[kind] ?? 'This file could not be read.'
  return line === undefined ? body : `${body} It starts around line ${line}.`
}

/**
 * A database failure as a sentence, without quoting the database.
 *
 * Two rules shape this, and they pull in the same direction.
 *
 * The error MESSAGE Postgres returns often quotes the offending value — the
 * merchant that failed a domain check, the amount that broke a constraint.
 * CLAUDE.md forbids an amount or a merchant reaching a log or a screen it was
 * not meant for, so the message is never passed through. Only the code is
 * read, and the code is an enum.
 *
 * And the user is not an engineer. `could not save the transactions: 23514`
 * told them nothing; on a dropped connection — the likeliest first failure —
 * `error.code` is not set at all and the sentence ended in a bare colon, or
 * the word `undefined`. A sentence that names what happened and what to do is
 * the whole requirement.
 *
 * The code is kept in parentheses. It is meaningless to the reader and exact
 * for anyone they show it to, which is the only way a screenshot is useful.
 */
const WRITE_FAILURES: Record<string, string> = {
  '23505': 'You already have this, so nothing was added.',
  '23514':
    'The numbers did not add up, so nothing was saved. This usually means a row went missing while the file was being read — it is a fault in the import, not in your file.',
  '23503': 'This refers to an account or category that no longer exists.',
  '23502': 'Something required was missing from this import.',
  '22001': 'A description in this file is longer than the app will store.',
  '42501': 'Your sign-in does not allow this. Signing out and back in usually fixes it.',
  '28000': 'You are not signed in any more. Sign in again and retry — nothing was saved.',
  PGRST301: 'Your session expired. Sign in again and retry — nothing was saved.',
  '': 'Could not reach the database. Check your connection and try again — nothing was saved.',
}

export interface WriteError {
  readonly code?: string | null | undefined
}

export function describeWriteFailure(error: WriteError | null | undefined): string {
  // supabase-js leaves `code` unset for anything that is not a PostgREST
  // response — a dropped connection, a DNS failure, a gateway error. That is
  // the empty-string entry above, and it is the most likely case of all.
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = WRITE_FAILURES[code]
  if (body === undefined) {
    return `Something went wrong and nothing was saved. (code ${code || 'unknown'})`
  }
  return code === '' ? body : `${body} (code ${code})`
}

/** What Setup was doing when a write failed. */
export type SetupAction = 'add' | 'rename' | 'move' | 'reorder' | 'remove'

/**
 * Setup's own sentences for the refusals its writes can meet.
 *
 * describeWriteFailure is worded for imports: a refused CHECK (23514) reads
 * "the numbers did not add up", and a category still in use (23503) reads
 * "no longer exists". Neither is true here (docs/workbook-plan.md §6.5). The
 * code decides the sentence together with what was being done. Anything not
 * listed falls back to the import wording, which covers the connection and
 * sign-in failures that can happen anywhere.
 */
const SETUP_FAILURES: Readonly<Record<SetupAction, Readonly<Record<string, string>>>> = {
  add: {},
  rename: {
    '23505': 'You already have a category with that name, on this list or another. Use a different name.',
    // The name domain (0001) refuses control characters and empty names.
    '23514': 'That name has characters the app cannot store. Use letters, numbers and ordinary punctuation.',
  },
  // The trigger that refuses this arrives with monthly amounts (Workbook plan
  // 0009); it must raise check_violation for this sentence to be the one shown.
  move: { '23514': 'Remove the monthly amount first, then move it to another list.' },
  reorder: {},
  // Charges are not the only thing that holds a category: a learned shop
  // rule does too (N17), and moving a charge with "Always file" moves both.
  remove: {
    '23503':
      'This category still has charges, or shops the app learned to file here. On the Month, tap its row and use Move to… on each charge, with “Always file” ticked so the shop moves too.',
  },
}

/** For any Setup write, so the import wording for these two never shows here. */
const SETUP_ANY: Readonly<Record<string, string>> = {
  '23514': 'That change breaks a rule your lists follow, so nothing was saved.',
  '23503': 'That category is still in use, so nothing was changed.',
}

export function describeSetupFailure(action: SetupAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = SETUP_FAILURES[action][code] ?? SETUP_ANY[code]
  return body === undefined ? describeWriteFailure(error) : `${body} (code ${code})`
}

/**
 * Why a charge could not be moved to another category (Month → Move to…).
 *
 * recategorise_transaction (0006) raises 42501 when the charge or the
 * category is not the caller's, which in practice means it was removed or
 * changed on another device since the month was read; the import wording,
 * "your sign-in does not allow this", would send the owner to sign out for
 * nothing. PGRST202 is PostgREST saying the function does not exist: 0006
 * has not been pasted yet, which is the owner's to do, so say where.
 */
const MOVE_FAILURES: Readonly<Record<string, string>> = {
  '42501': 'That charge or that category is no longer there — it may have changed on another device. Nothing was moved.',
  PGRST202:
    'Moving a charge needs a database update that has not been applied yet (0006 in the setup guide). Nothing was moved.',
  '23514': 'That move breaks a rule the ledger follows, so nothing was moved.',
}

export function describeMoveFailure(error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = MOVE_FAILURES[code]
  return body === undefined ? describeWriteFailure(error) : `${body} (code ${code})`
}

/** What the Month was doing with budgets and goals when a request failed. */
export type BudgetAction = 'read'

/**
 * Why the Month's budgets and goals could not be read (0008).
 *
 * PGRST205, or 42P01 from an older PostgREST, is the table not existing:
 * 0008 has not been pasted yet, which is the owner's to do, so say where
 * rather than leave a bare code (N28). A read saves nothing, so it never
 * falls back to the import wording, which says "nothing was saved".
 */
const NOT_APPLIED = 'Budgets need a database update that has not been applied yet (0008 in the setup guide)'
const BUDGET_FAILURES: Readonly<Record<BudgetAction, Readonly<Record<string, string>>>> = {
  read: {
    PGRST205: `${NOT_APPLIED}, so this month cannot be shown.`,
    '42P01': `${NOT_APPLIED}, so this month cannot be shown.`,
    '': 'Could not reach the database to read your budgets. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this month.',
  },
}
const BUDGET_ANY: Readonly<Record<BudgetAction, string>> = {
  read: 'Your budgets could not be read, so this month is not shown. Try again.',
}

export function describeBudgetFailure(action: BudgetAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = BUDGET_FAILURES[action][code] ?? BUDGET_ANY[action]
  return code === '' ? body : `${body} (code ${code})`
}

/**
 * Today, in the user's own time zone, as an ISO date.
 *
 * The one place the app reads the clock. packages/core takes `asOf` as a
 * parameter and never reads one itself (CLAUDE.md), so the screen decides
 * what "today" is and passes it down. Built from local date parts: an ISO
 * string from toISOString() is UTC, and in Alberta that is tomorrow from
 * 6pm onward.
 */
export function todayIso(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The user's own calendar date of a database timestamp, as an ISO date.
 *
 * For the same reason as todayIso: slicing the UTC string would date an
 * evening import in Alberta to the next day.
 */
export function localDateOf(timestamp: string): string {
  const at = new Date(timestamp)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/** `2026-09-21`..`2026-09-27` as `21 – 27 Sep`, or across months `28 Sep – 4 Oct`. */
export function formatDateRange(from: string, to: string): string {
  const [, fm, fd] = from.split('-')
  const [, tm, td] = to.split('-')
  const fromMonth = MONTHS[Number(fm) - 1] ?? ''
  const toMonth = MONTHS[Number(tm) - 1] ?? ''
  return fm === tm
    ? `${Number(fd)} – ${Number(td)} ${toMonth}`
    : `${Number(fd)} ${fromMonth} – ${Number(td)} ${toMonth}`
}

/** Basis points from the engine, shown as a whole percentage. Display only. */
export function formatBasisPoints(bp: number): string {
  return `${Math.round(bp / 100)}%`
}

/** An amount in a column whose heading already says it is money: `1,600.00`, `-32.74`. */
export function formatAmount(amountCents: number): string {
  return formatCents(amountCents).replace('$', '')
}

/** A signed amount shown as a magnitude, for places where the direction is the label. */
export function formatMagnitude(amountCents: number): string {
  return formatCents(Math.abs(amountCents))
}
