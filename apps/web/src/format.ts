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

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `2026-09-01` as `Sep 2026`, where a table has no room for the whole name. */
export function formatShortMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  const name = MONTHS[Number(month) - 1]
  return year === undefined || name === undefined ? isoDate : `${name} ${year}`
}

/** `2026-09` or `2026-09-14` as `September 2026`, the Month screen's title. */
export function formatMonthTitle(isoDate: string): string {
  const [year, month] = isoDate.split('-')
  const name = MONTH_NAMES[Number(month) - 1]
  return year === undefined || name === undefined ? isoDate : `${name} ${year}`
}

/**
 * `2026-09-01` as `September`, where the year is plain from the screen.
 * The screens used to cut it from formatMonthTitle at its space (CR-9).
 */
export function formatMonthName(isoDate: string): string {
  return MONTH_NAMES[Number(isoDate.split('-')[1]) - 1] ?? isoDate
}

/** `2026-09-03` as `3 Sep`: a day in a list whose year is plain. */
export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  const name = MONTHS[Number(month) - 1]
  return day === undefined || name === undefined ? isoDate : `${Number(day)} ${name}`
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
/** How PostgREST and Postgres say a table, column or function is not there: a one-time update not pasted yet. */
const MISSING_UPDATE = ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'] as const

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
  // A table, column or function that a one-time update adds, not there yet
  // (N28): said as what it is, where "something went wrong" said nothing.
  ...Object.fromEntries(MISSING_UPDATE.map((code) => [code, 'This needs a one-time update, so nothing was saved.'])),
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
 * "no longer exists". Neither is true here (docs/workbook-views-plan.md §6.5). The
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
  // 0009's trigger raises check_violation while an amount is in effect this
  // month or set for a later one. Stop is how Setup removes it (S9).
  move: { '23514': 'Remove the monthly amount first (Stop, under its amount), then move it to another list.' },
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
    'Moving a charge needs a one-time update. Nothing was moved.',
  '23514': 'That move breaks a rule the ledger follows, so nothing was moved.',
}

export function describeMoveFailure(error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = MOVE_FAILURES[code]
  return body === undefined ? describeWriteFailure(error) : `${body} (code ${code})`
}

/** What the Month was doing with budgets and goals when a request failed. */
export type BudgetAction = 'read' | 'save'

/**
 * Why the Month's budgets and goals could not be read or saved (0008).
 *
 * PGRST205, or 42P01 from an older PostgREST, is the table not existing:
 * 0008 has not been pasted yet, which is the owner's to do, so say it needs
 * a one-time update, which links to Help (N28), rather than leave a bare code. The import wording is wrong for both
 * of 0008's refusals: a category removed elsewhere is 23503, and the only
 * CHECK the Month can meet is a negative amount (23514). A save otherwise
 * falls back to that wording, whose connection and sign-in sentences hold
 * for any write; a read saves nothing, so it never does.
 */
const NOT_APPLIED = 'Budgets need a one-time update'
const BUDGET_FAILURES: Readonly<Record<BudgetAction, Readonly<Record<string, string>>>> = {
  read: {
    PGRST205: `${NOT_APPLIED}, so this month cannot be shown.`,
    '42P01': `${NOT_APPLIED}, so this month cannot be shown.`,
    '': 'Could not reach the database to read your budgets. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this month.',
  },
  save: {
    PGRST205: `${NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${NOT_APPLIED}. Nothing was saved.`,
    '23503': 'That category is no longer there — it may have been removed on another device. Nothing was saved.',
    '23514': 'A budget or goal cannot be below zero. Nothing was saved.',
  },
}

export function describeBudgetFailure(action: BudgetAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = BUDGET_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  return action === 'save'
    ? describeWriteFailure(error)
    : `Your budgets could not be read, so this month is not shown. Try again. (code ${code})`
}

/**
 * Why Setup's monthly amounts and days paid could not be read or saved (0009).
 *
 * As for budgets: PGRST205, or 42P01 from an older PostgREST, is 0009 not
 * pasted yet, so say where, and a read never says "nothing was saved"
 * (N28). A save meets two refusals of its own. 0009's trigger raises 23514
 * for a category not on Bills, Debts or Subscriptions, which Setup only
 * offers on those lists, so it means the category moved on another device
 * after Setup read it; the screen refuses a negative amount or a day
 * outside 1 to 31 before sending, so those CHECKs never reach here. A
 * category removed elsewhere is 23503.
 *
 * The Month reads them too ('month'), and unlike Setup it shows nothing
 * without them: a month without its planned bills has a Spent that looks
 * right and is not. So its sentences say the month is not shown. The Week
 * ('week') is the same, and its sentences name the week, as Paycheck's
 * ('paycheck') name its pay period and the Bill Calendar's ('calendar') it.
 */
export type PlanAction = 'read' | 'month' | 'week' | 'paycheck' | 'calendar' | 'save'
const PLANS_NOT_APPLIED = 'Monthly amounts need a one-time update'
const PLAN_FAILURES: Readonly<Record<PlanAction, Readonly<Record<string, string>>>> = {
  month: {
    PGRST205: `${PLANS_NOT_APPLIED}, so this month cannot be shown.`,
    '42P01': `${PLANS_NOT_APPLIED}, so this month cannot be shown.`,
    '': 'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this month.',
  },
  week: {
    PGRST205: `${PLANS_NOT_APPLIED}, so this week cannot be shown.`,
    '42P01': `${PLANS_NOT_APPLIED}, so this week cannot be shown.`,
    '': 'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this week.',
  },
  paycheck: {
    PGRST205: `${PLANS_NOT_APPLIED}, so this pay period cannot be shown.`,
    '42P01': `${PLANS_NOT_APPLIED}, so this pay period cannot be shown.`,
    '': 'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this pay period.',
  },
  calendar: {
    PGRST205: `${PLANS_NOT_APPLIED}, so this calendar cannot be shown.`,
    '42P01': `${PLANS_NOT_APPLIED}, so this calendar cannot be shown.`,
    '': 'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this calendar.',
  },
  read: {
    PGRST205: `${PLANS_NOT_APPLIED}, so they are not shown. Your lists still work.`,
    '42P01': `${PLANS_NOT_APPLIED}, so they are not shown. Your lists still work.`,
    '': 'Could not reach the database to read your monthly amounts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see your monthly amounts.',
  },
  save: {
    PGRST205: `${PLANS_NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${PLANS_NOT_APPLIED}. Nothing was saved.`,
    '23514':
      "That list can't have a monthly amount: only Bills, Debts and Subscriptions can. It may have been moved on another device. Nothing was saved.",
    '23503': 'That category is no longer there — it may have been removed on another device. Nothing was saved.',
  },
}

export function describePlanFailure(action: PlanAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = PLAN_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  if (action === 'save') return describeWriteFailure(error)
  return `Your monthly amounts could not be read, so ${shownBy(action)} not shown. Try again. (code ${code})`
}

/** What a failed read of monthly amounts leaves unshown, for its sentence. */
export function shownBy(reader: PlanAction): string {
  if (reader === 'paycheck') return 'this pay period is'
  if (reader === 'calendar') return 'this calendar is'
  return reader === 'month' ? 'this month is' : reader === 'week' ? 'this week is' : 'they are'
}

/**
 * Why pay schedules could not be read or saved (0011).
 *
 * As for monthly amounts: PGRST205, or 42P01 from an older PostgREST, is
 * 0011 not pasted yet, so say where, and a read never says "nothing was
 * saved" (N28). Setup ('read') still shows its lists without them; the
 * Paycheck view ('paycheck') has no period to show, and the Bill Calendar
 * ('calendar') no paydays, so it shows nothing. A save meets 0011's
 * trigger, 23514, only for a category moved off Income on another device
 * after Setup read it, since Setup offers a schedule on Income alone, and
 * the key to the category, 23503, for one removed there.
 */
export type ScheduleAction = 'read' | 'paycheck' | 'calendar' | 'save'
const SCHEDULES_NOT_APPLIED = 'Pay schedules need a one-time update'
const SCHEDULE_FAILURES: Readonly<Record<ScheduleAction, Readonly<Record<string, string>>>> = {
  read: {
    PGRST205: `${SCHEDULES_NOT_APPLIED}, so when you are paid is not shown. Your lists still work.`,
    '42P01': `${SCHEDULES_NOT_APPLIED}, so when you are paid is not shown. Your lists still work.`,
    '': 'Could not reach the database to read when you are paid. Check your connection and try again.',
  },
  paycheck: {
    PGRST205: `${SCHEDULES_NOT_APPLIED}, so no pay period can be shown.`,
    '42P01': `${SCHEDULES_NOT_APPLIED}, so no pay period can be shown.`,
    '': 'Could not reach the database to read when you are paid. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this pay period.',
  },
  calendar: {
    PGRST205: `${SCHEDULES_NOT_APPLIED}, so this calendar cannot be shown.`,
    '42P01': `${SCHEDULES_NOT_APPLIED}, so this calendar cannot be shown.`,
    '': 'Could not reach the database to read when you are paid. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this calendar.',
  },
  save: {
    PGRST205: `${SCHEDULES_NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${SCHEDULES_NOT_APPLIED}. Nothing was saved.`,
    '23514': 'Only an income source can have a payday. It may have been moved to another list on another device. Nothing was saved.',
    '23503': 'That category is no longer there — it may have been removed on another device. Nothing was saved.',
  },
}

export function describeScheduleFailure(action: ScheduleAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = SCHEDULE_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  if (action === 'save') return describeWriteFailure(error)
  return `When you are paid could not be read, so ${scheduleShownBy(action)} not shown. Try again. (code ${code})`
}

/** What a failed read of pay schedules leaves unshown, for its sentence. */
export function scheduleShownBy(reader: Exclude<ScheduleAction, 'save'>): string {
  return reader === 'read' ? 'it is' : reader === 'calendar' ? 'this calendar is' : 'this pay period is'
}

/** What the Month was doing with its starting balance when a request failed. */
export type BalanceAction = 'read' | 'save'

/**
 * Why a month's starting balance could not be read or saved (0010).
 *
 * As for budgets: PGRST205, or 42P01 from an older PostgREST, is 0010 not
 * pasted yet, so say where, and a read never says "nothing was saved"
 * (N28). A read that fails shows no month rather than ask for a balance
 * that may be there. The Month sends only a first-of-month and a whole
 * amount, and clears by deleting, so 0010's CHECK and NOT NULL never refuse
 * a save; a save otherwise falls back to the import wording, whose
 * connection and sign-in sentences hold for any write.
 */
const BALANCE_NOT_APPLIED = 'Starting balances need a one-time update'
const BALANCE_FAILURES: Readonly<Record<BalanceAction, Readonly<Record<string, string>>>> = {
  read: {
    PGRST205: `${BALANCE_NOT_APPLIED}, so this month cannot be shown.`,
    '42P01': `${BALANCE_NOT_APPLIED}, so this month cannot be shown.`,
    '': 'Could not reach the database to read your starting balance. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see this month.',
  },
  save: {
    PGRST205: `${BALANCE_NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${BALANCE_NOT_APPLIED}. Nothing was saved.`,
  },
}

export function describeBalanceFailure(action: BalanceAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = BALANCE_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  return action === 'save'
    ? describeWriteFailure(error)
    : `Your starting balance could not be read, so this month is not shown. Try again. (code ${code})`
}

/** What the Savings screen was doing when a request failed. */
export type FundAction = 'read' | 'save'

/**
 * Why savings funds could not be read or saved (0013).
 *
 * 0013 adds columns, not a table, so before it is pasted a read naming them
 * is 42703 (no such column) and a write PGRST204 (PostgREST knows none), not
 * PGRST205; either way, say where. A save meets 0013's refusals: 23514 from
 * its trigger for a category moved off Savings on another device (or 0004's
 * CHECKs, which the screen refuses before sending), 23505 for a second goal
 * on one fund or a goal name already used, and 23503 for a category removed
 * elsewhere. A read never says "nothing was saved" (N28).
 */
const FUNDS_NOT_APPLIED = 'Savings funds need a one-time update'
const FUND_FAILURES: Readonly<Record<FundAction, Readonly<Record<string, string>>>> = {
  read: {
    '42703': `${FUNDS_NOT_APPLIED}, so your funds cannot be shown.`,
    '': 'Could not reach the database to read your savings funds. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see your savings funds.',
  },
  save: {
    '42703': `${FUNDS_NOT_APPLIED}. Nothing was saved.`,
    PGRST204: `${FUNDS_NOT_APPLIED}. Nothing was saved.`,
    '23514': 'Only a fund on your Savings list can have a savings goal. It may have been moved on another device. Nothing was saved.',
    '23505': 'That fund already has a goal, or another goal has this name. Nothing was saved.',
    '23503': 'That fund is no longer there — it may have been removed on another device. Nothing was saved.',
  },
}

export function describeFundFailure(action: FundAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = FUND_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  return action === 'save'
    ? describeWriteFailure(error)
    : `Your savings funds could not be read, so they are not shown. Try again. (code ${code})`
}

/** What the Debts screen was doing when a request failed. */
export type DebtAction = 'read' | 'save' | 'extra'

/**
 * Why debts could not be read or saved (0014).
 *
 * PGRST205, or 42P01 from an older PostgREST, is 0014 not pasted yet. A
 * debt's name is unique (23505). 0014's triggers refuse an extra payment
 * before its debt's start month, and a start month moved past an extra
 * (23514); the screen checks both before sending, so 23514 here is another
 * device's change. 23503 is a debt removed elsewhere.
 */
const DEBTS_NOT_APPLIED = 'Debts need a one-time update'
const DEBT_FAILURES: Readonly<Record<DebtAction, Readonly<Record<string, string>>>> = {
  read: {
    PGRST205: `${DEBTS_NOT_APPLIED}, so your debts cannot be shown.`,
    '42P01': `${DEBTS_NOT_APPLIED}, so your debts cannot be shown.`,
    '': 'Could not reach the database to read your debts. Check your connection and try again.',
    PGRST301: 'Your session expired. Sign in again to see your debts.',
  },
  save: {
    PGRST205: `${DEBTS_NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${DEBTS_NOT_APPLIED}. Nothing was saved.`,
    '23505': 'You already have a debt with that name. Nothing was saved.',
    '23514': 'This debt has extra payments before that start month. Remove them first, or choose an earlier month. Nothing was saved.',
  },
  extra: {
    PGRST205: `${DEBTS_NOT_APPLIED}. Nothing was saved.`,
    '42P01': `${DEBTS_NOT_APPLIED}. Nothing was saved.`,
    '23514': 'An extra payment cannot come before the month the debt starts. It may have been changed on another device. Nothing was saved.',
    '23503': 'That debt is no longer there. It may have been removed on another device. Nothing was saved.',
  },
}

export function describeDebtFailure(action: DebtAction, error: WriteError | null | undefined): string {
  const code = typeof error?.code === 'string' ? error.code : ''
  const body = DEBT_FAILURES[action][code]
  if (body !== undefined) return code === '' ? body : `${body} (code ${code})`
  return action === 'read' ? `Your debts could not be read, so they are not shown. Try again. (code ${code})` : describeWriteFailure(error)
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

/** An APR as typed, in hundredths of a percent: 1999 is "19.99%", 500 is "5%". Display only. */
export function formatRate(bp: number): string {
  const hundredths = bp % 100
  return hundredths === 0 ? `${(bp - hundredths) / 100}%` : `${(bp - hundredths) / 100}.${String(hundredths).padStart(2, '0')}%`
}

/**
 * A share of a whole from the engine, as a whole percentage. A category with
 * spending never reads "0%": under half a percent says so instead.
 */
export function formatShare(bp: number): string {
  return bp < 50 ? 'under 1%' : formatBasisPoints(bp)
}

/** An amount in a column whose heading already says it is money: `1,600.00`, `-32.74`. */
export function formatAmount(amountCents: number): string {
  return formatCents(amountCents).replace('$', '')
}

/**
 * An amount as a spreadsheet reads a number: "1234.56", "-32.74", no symbol
 * and no commas. A download writes it (plan A19), so the file holds the
 * screen's own figure rather than one worked out again.
 */
export function formatPlainAmount(amountCents: number): string {
  // The "$" follows a minus sign, so it is not always first.
  return formatAmount(amountCents).replace(/,/g, '')
}

/** Cents as the text a person would type back in: "250.00", "-412.75", or "" for none. */
export function formatForInput(cents: number | null): string {
  return cents === null ? '' : formatPlainAmount(cents)
}

/** A change from core (F26) in words: "$40.00 more", "$40.00 less" or "about the same". Display only. */
export function formatChange(change: { readonly changeCents: number; readonly direction: 'more' | 'less' | 'same' }): string {
  return change.direction === 'same' ? 'about the same' : `${formatMagnitude(change.changeCents)} ${change.direction}`
}

/** Whole minutes from the engine (timeEquivalent) as "22 min", "1 h" or "1 h 5 min". Display only. */
export function formatMinutes(totalMinutes: number): string {
  const minutes = totalMinutes % 60
  const hours = (totalMinutes - minutes) / 60
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

/**
 * An amount the engine already rounded to whole dollars (F30's $10 steps)
 * without its cents: "$3,310", "-$20". Refuses one with cents, which would
 * be a figure shown as rounder than it is. Display only.
 */
export function formatWholeDollars(amountCents: number): string {
  if (amountCents % 100 !== 0) throw new RangeError(`Not a whole-dollar amount: ${amountCents}`)
  return formatCents(amountCents).slice(0, -3)
}

/** A signed amount shown as a magnitude, for places where the direction is the label. */
export function formatMagnitude(amountCents: number): string {
  return formatCents(Math.abs(amountCents))
}
