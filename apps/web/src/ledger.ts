/**
 * The write path: an import becomes a batch, candidates, and a record of the
 * lines that could not be read. Then, one at a time, a candidate becomes a
 * transaction.
 *
 * Nothing here computes money. It carries amounts the parsers produced and
 * hands them to Postgres, where `amount_cents` is a bigint.
 */
import {
  assignDiscriminators,
  computeDedupeHash,
  DEDUPE_HASH_VERSION,
  normalizeMerchant,
  type AcceptedRow,
  type RejectedRow,
  type StatementPeriod,
} from '@budget/statement-parsers'
import {
  budgetShownBy,
  describeBalanceFailure,
  describeBudgetFailure,
  describeDebtFailure,
  describeFundFailure,
  describeMoveFailure,
  describePlanFailure,
  describeScheduleFailure,
  describeSetupFailure,
  describeWriteFailure,
  scheduleShownBy,
  shownBy,
  type BudgetAction,
  type PlanAction,
  type ScheduleAction,
  type WriteError,
} from './format.js'
import type { GoalStatus } from '@budget/core'
import { LIST_HEADING, type CategoryKind } from './lists.js'
import type { SupabaseClient } from './supabase.js'

export type IngestSource = 'card_csv' | 'card_xlsx' | 'card_pdf' | 'receipt_photo' | 'typed' | 'ai_app'

/** What a reader hands over to be saved. */
export type ImportRequest = {
  readonly accepted: readonly AcceptedRow[]
  readonly rejected: readonly RejectedRow[]
  readonly parsed: number
} & (
  | {
      readonly source: 'card_pdf'
      /**
       * The dates the statement says it covers. Required for a PDF, which
       * always prints them, so that "Statement imported up to" comes from the
       * statement and not from the latest row (migration 0007).
       */
      readonly period: StatementPeriod
    }
  | {
      /** Where the rows came from. Was hardcoded to card_csv, which a PDF is not. */
      readonly source: Exclude<IngestSource, 'card_pdf' | 'ai_app'>
      /** A CSV export, a photo and a typed row carry no period. */
      readonly period?: undefined
    }
)

export type SaveImportInput = ImportRequest & {
  readonly userId: string
  readonly accountId: string
}

export interface SaveImportResult {
  readonly batchId: string
  readonly inserted: number
  readonly deduped: number
  readonly rejected: number
  /** Of those inserted, how many a learned merchant rule approved outright. */
  readonly autoApproved: number
  /** Of those inserted, how many wait for a person. Row counts, not money. */
  readonly waiting: number
}

/**
 * Save one import: one call, one transaction.
 *
 * This was five round trips — insert a batch with zero counts, ask which
 * hashes already existed, insert the candidates, insert the unreadable lines,
 * go back and update the counts — with nothing holding them together. Any
 * failure in the middle left the database holding part of an import that
 * nothing would ever finish, and a retry then added a second copy of
 * everything that had already landed.
 *
 * The duplicate question used to be asked by putting every hash in a URL.
 * Sixty-four hex characters times a few hundred rows is past what a gateway
 * accepts, so a large import died with a transport error before a single row
 * was written. It is answered inside the database now (migration 0003), where
 * the size of the question costs nothing.
 *
 * The counts come back from the database, and they are observed rather than
 * derived. The previous version computed `deduped = parsed - inserted -
 * rejected` and then leaned on the CHECK `parsed = deduped + inserted +
 * rejected` to catch a lost row. Substituting one into the other gives
 * `parsed = parsed` — an identity that holds however many rows went missing.
 * The comment claiming that CHECK made the import trustworthy was simply
 * wrong, for as long as it stood.
 */
export async function saveImport(
  supabase: SupabaseClient,
  input: SaveImportInput,
): Promise<SaveImportResult> {
  // An issuer id where the export gave one, otherwise the nth occurrence among
  // rows identical in account, date, amount and description. Without it, two
  // identical coffees on one day collide and the ledger loses one.
  const discriminators = assignDiscriminators(
    input.accepted,
    (row) => `${row.postedOn}|${row.amountCents}|${row.merchantRaw}`,
    (row) => row.issuerTransactionId,
  )

  const rows = await Promise.all(
    input.accepted.map(async (row, index) => {
      const discriminator = discriminators[index]
      if (discriminator === undefined) throw new Error('missing discriminator for a parsed row')
      return {
        posted_on: row.postedOn,
        amount_cents: row.amountCents,
        // The tidied name for matching a rule, the original for the record.
        // These were both written with the raw descriptor until now, which
        // made merchant_rules incapable of ever matching anything.
        merchant: normalizeMerchant(row.merchantRaw),
        merchant_raw: row.merchantRaw,
        dedupe_hash: await computeDedupeHash({
          accountId: input.accountId,
          postedOn: row.postedOn,
          amountCents: row.amountCents,
          merchantRaw: row.merchantRaw,
          discriminator,
        }),
        dedupe_hash_v: DEDUPE_HASH_VERSION,
      }
    }),
  )

  const args = {
    p_account_id: input.accountId,
    p_source: input.source,
    p_parsed: input.parsed,
    p_rows: rows,
    p_unreadable: input.rejected.map((r) => ({ source_line: r.line, reason: r.reason })),
  }
  // With a period, the seven-argument save_import (0007), which saves the
  // import exactly as the five-argument one does and records the period in
  // the same transaction. Without one, the five-argument function as before.
  const { data, error } = await supabase.rpc(
    'save_import',
    input.period === undefined
      ? args
      : { ...args, p_period_start: input.period.from, p_period_end: input.period.to },
  )
  if (error !== null) throw new Error(describeWriteFailure(error))

  const result = (Array.isArray(data) ? data[0] : data) as SavedCounts | undefined
  if (result === undefined) throw new Error(describeWriteFailure(null))

  return {
    batchId: String(result.batch_id),
    inserted: Number(result.inserted),
    deduped: Number(result.deduped),
    rejected: Number(result.rejected),
    autoApproved: Number(result.auto_approved ?? 0),
    waiting: Number(result.inserted) - Number(result.auto_approved ?? 0),
  }
}

/** What save_import returns. Shaped by migrations 0003 and 0004. */
interface SavedCounts {
  readonly batch_id: string
  readonly parsed: number
  readonly deduped: number
  readonly inserted: number
  readonly rejected: number
  readonly auto_approved?: number
}

function fail(error: { code?: string | null } | null): never {
  throw new Error(describeWriteFailure(error))
}

// ---------------------------------------------------------------------------
// The review queue
// ---------------------------------------------------------------------------

export interface PendingCandidate {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  /** Normalised: what a learned rule matches on. */
  readonly merchant: string
  readonly merchant_raw: string
  /**
   * Set on a row waiting here only by a model's suggestion (0018), which
   * the owner still confirms: 0004 refuses approving it as the model's.
   */
  readonly category_id: string | null
  readonly category_source: 'model' | 'user' | 'merchant_rule' | null
  /** Where it came from: an AI app's addition says so in Review (0020). */
  readonly source: IngestSource
}

export interface PendingPage {
  readonly rows: readonly PendingCandidate[]
  /** The real total, which can exceed the rows fetched. */
  readonly total: number
}

/**
 * The queue, oldest first, with its true size.
 *
 * The count comes from the database. It used to be the length of the page,
 * which capped at 200 and then printed "200 waiting" for a queue of 400 — the
 * rest unreachable and the headline wrong.
 */
export async function listPending(supabase: SupabaseClient, limit = 300): Promise<PendingPage> {
  const { data, error, count } = await supabase
    .from('ingest_candidates')
    .select('id, posted_on, amount_cents, merchant, merchant_raw, category_id, category_source, source', { count: 'exact' })
    .eq('status', 'pending')
    .order('posted_on', { ascending: true })
    .limit(limit)
  if (error !== null) fail(error)
  const rows = (data ?? []) as PendingCandidate[]
  return { rows: rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) })), total: count ?? rows.length }
}

export type ApproveOutcome = 'approved' | 'already_handled' | 'already_in_ledger'

/**
 * Approve one candidate into a category, in one database transaction.
 *
 * approve_candidate (migration 0004) performs the conditional UPDATE and the
 * ON CONFLICT insert CLAUDE.md prescribes, and records the merchant -> category
 * rule so the next statement approves this merchant by itself. It was two
 * browser round trips, and a failure between them lost the row entirely.
 */
export async function approveCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  categoryId: string,
): Promise<ApproveOutcome> {
  const { data, error } = await supabase.rpc('approve_candidate', {
    p_candidate: candidateId,
    p_category: categoryId,
  })
  if (error !== null) fail(error)
  const outcome = String(data)
  return outcome === 'approved' || outcome === 'already_in_ledger' ? outcome : 'already_handled'
}

/**
 * Put a suggested category back to none, so the row waits with nothing
 * picked. clear_candidate_suggestion (0018) acts only on the caller's own
 * row that still waits with a model's suggestion; any other row is left
 * alone, and false says so.
 */
export async function clearCandidateSuggestion(supabase: SupabaseClient, candidateId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('clear_candidate_suggestion', { p_candidate: candidateId })
  if (error !== null) fail(error)
  return data === true
}

export async function rejectCandidate(supabase: SupabaseClient, candidateId: string): Promise<void> {
  const { error } = await supabase.rpc('reject_candidate', { p_candidate: candidateId })
  if (error !== null) fail(error)
}

export interface UnreadableBatch {
  readonly id: string
  readonly source: IngestSource
  readonly created_at: string
}

export interface UnreadableLine {
  readonly id: string
  readonly batch_id: string
  /** 1-based. Only the position is stored, never the text (migration 0002). */
  readonly source_line: number
  /** A rejection_reason code, for describeReason to put into words. */
  readonly reason: string
}

export interface UnreadablePage {
  /** Newest import first. Only imports that left at least one line behind. */
  readonly batches: readonly UnreadableBatch[]
  readonly lines: readonly UnreadableLine[]
  /** The real number of lines, which can exceed the lines fetched. */
  readonly total: number
}

/**
 * Lines no import could read that the owner has not dismissed, grouped by
 * the import, newest first.
 *
 * However old: a line leaves only when dismissed (0012), so there is no
 * window to age it out. The lines are read first and then only their own
 * imports, so no cap on imports can hide a line (N21). A line is written in
 * the same transaction as its import and shares its created_at, which is
 * what puts the newest import's lines first.
 *
 * Two reads rather than an embedded join, so each is a plain query the fake
 * test server answers the way PostgREST does. The browser keeps SELECT on both
 * tables (0004 revoked only the writes), and RLS scopes both to the owner.
 */
export async function listUnreadable(supabase: SupabaseClient, limit = 200): Promise<UnreadablePage> {
  const { data, error, count } = await supabase
    .from('ingest_unreadable_lines')
    .select('id, batch_id, source_line, reason', { count: 'exact' })
    .is('dismissed_at', null)
    .order('created_at', { ascending: false })
    .order('batch_id', { ascending: true })
    .order('source_line', { ascending: true })
    .limit(limit)
  if (error !== null) fail(error)
  const lines = ((data ?? []) as UnreadableLine[]).map((l) => ({ ...l, source_line: Number(l.source_line) }))
  if (lines.length === 0) return { batches: [], lines, total: count ?? lines.length }

  const imports = await supabase
    .from('ingest_batches')
    .select('id, source, created_at')
    .in('id', [...new Set(lines.map((l) => l.batch_id))])
    .order('created_at', { ascending: false })
  if (imports.error !== null) fail(imports.error)
  return { batches: (imports.data ?? []) as UnreadableBatch[], lines, total: count ?? lines.length }
}

/**
 * Record that the owner has dealt with a line, so Review stops showing it.
 *
 * Through dismiss_unreadable_line (0012), because 0004 took UPDATE on these
 * lines away from the browser. The line is kept, stamped; dismissing one
 * already dismissed changes nothing.
 */
export async function dismissUnreadableLine(supabase: SupabaseClient, lineId: string): Promise<void> {
  const { error } = await supabase.rpc('dismiss_unreadable_line', { p_line: lineId })
  if (error !== null) fail(error)
}

/**
 * The latest day any imported statement covers, or null before the first.
 *
 * From the statement's own period (0007), never the newest ledger row: a
 * coffee typed today would otherwise claim a statement had been read up to
 * today. Only the latest is fetched; the engine takes a list so that a later
 * screen can pass more.
 */
export async function latestStatementEnd(supabase: SupabaseClient): Promise<readonly string[]> {
  const { data, error } = await supabase
    .from('ingest_batches')
    .select('period_end')
    .not('period_end', 'is', null)
    .order('period_end', { ascending: false })
    .limit(1)
  if (error !== null) fail(error)
  return ((data ?? []) as { period_end: string }[]).map((b) => b.period_end)
}

/**
 * Whether a card statement has ever been brought in (Getting started, step
 * 6). A typed row or a receipt photo is not a statement. One id at most is
 * read; nothing about the import is.
 */
export async function hasImportedStatement(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from('ingest_batches').select('id').in('source', ['card_csv', 'card_xlsx', 'card_pdf']).limit(1)
  if (error !== null) fail(error)
  return (data ?? []).length > 0
}

/**
 * What F24's history start is taken from: the first day of the earliest
 * statement period (0007), and the earliest ledger date for when no statement
 * has one. One row each; which counts is core's to say (historyStart).
 */
export async function readRecordsStart(
  supabase: SupabaseClient,
): Promise<{ readonly statementStarts: readonly string[]; readonly entryDates: readonly string[] }> {
  const [batches, entries] = await Promise.all([
    supabase
      .from('ingest_batches')
      .select('period_start')
      .not('period_start', 'is', null)
      .order('period_start', { ascending: true })
      .limit(1),
    supabase.from('transactions').select('posted_on').order('posted_on', { ascending: true }).limit(1),
  ])
  if (batches.error !== null) fail(batches.error)
  if (entries.error !== null) fail(entries.error)
  return {
    statementStarts: ((batches.data ?? []) as { period_start: string }[]).map((b) => b.period_start),
    entryDates: ((entries.data ?? []) as { posted_on: string }[]).map((t) => t.posted_on),
  }
}

/**
 * How many charges dated in a range still wait for review. A count, from the
 * database, so it is right however long the queue is; nothing else about them
 * is read, because nothing unreviewed is counted in a month (invariant 3).
 */
export async function countPendingBetween(
  supabase: SupabaseClient,
  range: { readonly from: string; readonly to: string },
): Promise<number> {
  const { error, count } = await supabase
    .from('ingest_candidates')
    .select('id', { count: 'exact' })
    .eq('status', 'pending')
    .gte('posted_on', range.from)
    .lte('posted_on', range.to)
    .limit(1)
  if (error !== null) fail(error)
  if (count === null) throw new Error('The review queue could not be counted. Try again.')
  return count
}

/** merchant -> category id, for suggesting what the user chose last time. */
export async function listRules(supabase: SupabaseClient): Promise<ReadonlyMap<string, string>> {
  const { data, error } = await supabase.from('merchant_rules').select('match_merchant, category_id')
  if (error !== null) fail(error)
  const rules = (data ?? []) as { match_merchant: string; category_id: string }[]
  return new Map(rules.map((r) => [r.match_merchant, r.category_id]))
}

// ---------------------------------------------------------------------------
// Typed entry
// ---------------------------------------------------------------------------

export interface TypedEntry {
  readonly accountId: string
  readonly postedOn: string
  /** Signed, ledger convention: a purchase is negative. */
  readonly amountCents: number
  readonly merchantRaw: string
  readonly categoryId: string
}

export async function addTypedTransaction(supabase: SupabaseClient, entry: TypedEntry): Promise<void> {
  const { error } = await supabase.rpc('add_typed_transaction', {
    p_account_id: entry.accountId,
    p_posted_on: entry.postedOn,
    p_amount_cents: entry.amountCents,
    p_merchant: normalizeMerchant(entry.merchantRaw),
    p_merchant_raw: entry.merchantRaw,
    p_category: entry.categoryId,
  })
  if (error !== null) fail(error)
}

// ---------------------------------------------------------------------------
// Accounts and categories
// ---------------------------------------------------------------------------

export interface NamedRow {
  readonly id: string
  readonly name: string
}

export interface Category extends NamedRow {
  /** Which of the workbook's lists it is on (migration 0005). */
  readonly kind: CategoryKind
  /** Its row within that list; the list sorts by this, then by name. */
  readonly sort_order: number
  /** Null when no weekly limit is set, which is not the same as zero. */
  readonly weekly_budget_cents: number | null
}

type Named = NamedRow & { readonly kind?: CategoryKind }

/**
 * Find or create a row by name.
 *
 * Insert first, and read back only on a unique violation. The previous version
 * looked first and inserted second, while its comment claimed the database's
 * uniqueness made that race-safe; it did not — two quick taps both looked,
 * both found nothing, and the second insert failed with a raw 23505. Here the
 * violation IS the "already exists" answer.
 *
 * `fields` carries what else the table requires. A category needs its list:
 * since 0005 the database refuses one without (23502), and the NOT NULL check
 * fires before the unique one, so leaving it out failed even for a name that
 * already existed (N11). Every column comes back, so the caller can see which
 * list a name it did not create is on.
 */
async function ensureNamed(
  supabase: SupabaseClient,
  table: 'accounts' | 'categories',
  userId: string,
  name: string,
  fields: Readonly<Record<string, unknown>>,
): Promise<Named> {
  const { data: created, error: createError } = await supabase
    .from(table)
    .insert({ user_id: userId, name, ...fields })
    .select('*')
    .single()
  if (createError === null) return created as Named
  if (createError.code !== '23505') fail(createError)

  const { data: found, error: findError } = await supabase
    .from(table)
    .select('*')
    .eq('name', name)
    .single()
  if (findError !== null) fail(findError)
  return found as Named
}

/**
 * The card account, found by name, and created only when it is not there.
 *
 * Looked up first, unlike ensureNamed: it exists on every launch but the
 * first, and inserting first had the database refuse a write, 409, each
 * time, which the browser logs as an error (DT-1). The insert that follows
 * a miss is ensureNamed's, so two first launches at once are still safe.
 */
export async function ensureAccount(supabase: SupabaseClient, userId: string, name: string): Promise<Named> {
  const { data, error } = await supabase.from('accounts').select('*').eq('name', name).maybeSingle()
  if (error !== null) fail(error)
  return data === null ? ensureNamed(supabase, 'accounts', userId, name, {}) : (data as Named)
}

export interface NewCategory {
  readonly name: string
  readonly kind: CategoryKind
  /** From core's endOfList, so a new row lands at the bottom of its list. */
  readonly sortOrder: number
}

/**
 * Find or create a category on a list.
 *
 * A name lives on one list only (D11). Typing a name that is already on
 * another list is refused in words rather than quietly filing the row there:
 * the person asked for this list, and money received landing in Variable
 * expenses would count as negative spending.
 */
export async function ensureCategory(
  supabase: SupabaseClient,
  userId: string,
  category: NewCategory,
): Promise<NamedRow> {
  const row = await ensureNamed(
    supabase,
    'categories',
    userId,
    category.name,
    { kind: category.kind, sort_order: category.sortOrder },
  )
  if (row.kind !== undefined && row.kind !== category.kind) {
    throw new Error(
      `You already have “${category.name}” in ${LIST_HEADING[row.kind]}. Choose it from the list, or use another name.`,
    )
  }
  return row
}

/**
 * Add many categories in one write, leaving out any name already stored.
 *
 * ON CONFLICT (user_id, name) DO NOTHING, so a name that arrived between
 * reading the lists and writing them is skipped by the database rather than
 * refusing the whole set: two quick presses of Setup's starter button add
 * each name once. Returns how many rows were actually added.
 */
export async function addCategories(
  supabase: SupabaseClient,
  userId: string,
  rows: readonly NewCategory[],
): Promise<number> {
  if (rows.length === 0) return 0
  const { data, error } = await supabase
    .from('categories')
    .upsert(
      rows.map((row) => ({ user_id: userId, name: row.name, kind: row.kind, sort_order: row.sortOrder })),
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    )
    .select('id')
  // Nothing back with no error is not "none added"; say it failed instead.
  if (error !== null || data === null) throw new Error(describeSetupFailure('add', error))
  return data.length
}

export async function listCategories(supabase: SupabaseClient): Promise<readonly Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, kind, sort_order, weekly_budget_cents')
    .order('sort_order')
    .order('name')
  if (error !== null) fail(error)
  return ((data ?? []) as Category[]).map((c) => ({
    ...c,
    sort_order: Number(c.sort_order),
    weekly_budget_cents: c.weekly_budget_cents === null ? null : Number(c.weekly_budget_cents),
  }))
}

/**
 * Rename a category where it stands. Rows are keyed by id, never by name, so
 * every charge already filed under it follows the new name (unlike the workbook,
 * where a renamed cell orphans the rows that typed the old one).
 */
export async function renameCategory(supabase: SupabaseClient, categoryId: string, name: string): Promise<void> {
  const { error } = await supabase.from('categories').update({ name }).eq('id', categoryId)
  if (error !== null) throw new Error(describeSetupFailure('rename', error))
}

/**
 * Write new positions within a list, as core's moveInList worked them out.
 * One row at a time: a failure part-way leaves a valid order that is simply
 * not the one asked for, and the screen reloads to show what is stored.
 */
export async function setCategoryOrder(
  supabase: SupabaseClient,
  changes: readonly { readonly id: string; readonly sortOrder: number }[],
): Promise<void> {
  for (const change of changes) {
    const { error } = await supabase.from('categories').update({ sort_order: change.sortOrder }).eq('id', change.id)
    if (error !== null) throw new Error(describeSetupFailure('reorder', error))
  }
}

/** Move a category to another list, at the bottom of it. Its charges move with it. */
export async function moveCategory(
  supabase: SupabaseClient,
  categoryId: string,
  to: { readonly kind: CategoryKind; readonly sortOrder: number },
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ kind: to.kind, sort_order: to.sortOrder })
    .eq('id', categoryId)
  if (error !== null) throw new Error(describeSetupFailure('move', error))
}

/**
 * Remove a category. The database refuses while anything is filed under it
 * (every reference to a category is ON DELETE RESTRICT, migration 0001), so
 * a charge can never be left without one; Setup says so in words.
 */
export async function removeCategory(supabase: SupabaseClient, categoryId: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', categoryId)
  if (error !== null) throw new Error(describeSetupFailure('remove', error))
}

export async function setWeeklyBudget(
  supabase: SupabaseClient,
  categoryId: string,
  weeklyBudgetCents: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ weekly_budget_cents: weeklyBudgetCents })
    .eq('id', categoryId)
  if (error !== null) fail(error)
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

export interface LedgerRow {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  readonly merchant_raw: string
  readonly category_id: string
  readonly source: string
}

/**
 * Rows per request. Supabase answers at most 1,000 rows a request (PostgREST's
 * max-rows), whatever limit is asked for, so a bigger page is not one.
 */
const PAGE = 1000

/**
 * A read the database refused, with its code, so a screen can tell a
 * one-time update not yet pasted from a lost connection. Its message is the
 * sentence the read's own describer wrote.
 */
export class ReadRefused extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.name = 'ReadRefused'
    this.code = code
  }
}

/** A table, column or function a one-time update adds, not there yet (Help → One-time updates). */
const NOT_YET_PASTED: ReadonlySet<string> = new Set(['PGRST205', '42P01', '42703', 'PGRST204', 'PGRST202', '42883'])

export function needsOneTimeUpdate(cause: unknown): boolean {
  return cause instanceof ReadRefused && NOT_YET_PASTED.has(cause.code)
}

/** One page of a read, as supabase-js answers it. */
interface Page {
  readonly data: readonly unknown[] | null
  readonly error: WriteError | null
  readonly count: number | null
}

/**
 * Every row a query matches — all of them, or an error.
 *
 * The ledger read used to be one request with `.limit(2000)`, and the server
 * stops at 1,000 regardless, so a busy month would have come back short with
 * nothing to say so, and every total on screen been too low. This reads page
 * after page, each with the exact count of matching rows, until it holds that
 * many. If the count moves between pages, a page comes back empty early, or a
 * row arrives twice, rows were added or removed mid-read and the pages may
 * overlap or skip one, so it refuses with `changed` rather than guess. The
 * query must order on a unique key last, so no two rows tie and a page
 * boundary cannot shuffle one row into two pages. One change it cannot see: a
 * row removed from an earlier page while another is added past the next page
 * keeps the count and repeats nothing, yet skips a row (NOTICED N22).
 */
export async function readAll<T extends { readonly id: string }>(
  page: (from: number, to: number) => PromiseLike<Page>,
  failure: { readonly changed: string; readonly describe: (error: WriteError) => string },
): Promise<T[]> {
  const rows: T[] = []
  let expected: number | null = null
  do {
    const { data, error, count } = await page(rows.length, rows.length + PAGE - 1)
    if (error !== null) throw new ReadRefused(failure.describe(error), typeof error.code === 'string' ? error.code : '')
    const got = (data ?? []) as T[]
    if (count === null || (expected !== null && count !== expected)) throw new Error(failure.changed)
    expected = count
    if (got.length === 0 && rows.length < expected) throw new Error(failure.changed)
    rows.push(...got)
  } while (rows.length < expected)
  if (rows.length !== expected || new Set(rows.map((r) => r.id)).size !== rows.length) {
    throw new Error(failure.changed)
  }
  return rows
}

/** Every ledger row between two dates, inclusive, newest first, read whole (readAll). */
export async function listTransactions(
  supabase: SupabaseClient,
  range: { readonly from: string; readonly to: string },
): Promise<readonly LedgerRow[]> {
  const rows = await readAll<LedgerRow>(
    (from, to) =>
      supabase
        .from('transactions')
        .select('id, posted_on, amount_cents, merchant_raw, category_id, source', { count: 'exact' })
        .gte('posted_on', range.from)
        .lte('posted_on', range.to)
        .order('posted_on', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: 'Your transactions changed while this period was being read, so nothing is shown. Try again.',
      describe: describeWriteFailure,
    },
  )
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }))
}

export interface Recategorise {
  readonly transactionId: string
  readonly categoryId: string
  /** Also file this shop here from now on: its merchant rule is set to the category. */
  readonly learn: boolean
}

/**
 * Move one posted charge to another category.
 *
 * Through recategorise_transaction (migration 0006), because 0004 took UPDATE
 * on the ledger away from the browser. The function moves the charge and its
 * source candidate together, and with `learn` rewrites the shop's rule the way
 * approving it did, so the next statement files that shop in the new place.
 */
export async function recategoriseTransaction(supabase: SupabaseClient, move: Recategorise): Promise<void> {
  const { error } = await supabase.rpc('recategorise_transaction', {
    p_transaction: move.transactionId,
    p_category: move.categoryId,
    p_learn: move.learn,
  })
  if (error !== null) throw new Error(describeMoveFailure(error))
}

export async function deleteTransaction(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error !== null) fail(error)
}

// ---------------------------------------------------------------------------
// Budgets and goals typed on a month (migration 0008)
// ---------------------------------------------------------------------------

/** One budget or goal as it was typed. Which one is in effect is core's to say (resolveBudgets). */
export interface BudgetRow {
  readonly id: string
  readonly category_id: string
  /** The first day of the month it was typed for. */
  readonly month: string
  /** "From this month on" or "just this month" (D12). */
  readonly applies: 'onward' | 'only'
  /** Null is a typed "no budget", which is not $0. */
  readonly budget_cents: number | null
}

/**
 * Every budget and goal typed for the month starting `through` or before it,
 * read whole (readAll): everything that month's budgets can come from. A
 * later month's never reaches back, so none is read.
 */
export async function listBudgetHistory(
  supabase: SupabaseClient,
  through: string,
  reader: Exclude<BudgetAction, 'save'> = 'read',
): Promise<readonly BudgetRow[]> {
  const rows = await readAll<BudgetRow>(
    (from, to) =>
      supabase
        .from('category_budgets')
        .select('id, category_id, month, applies, budget_cents', { count: 'exact' })
        .lte('month', through)
        .order('month', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: `Your budgets changed while they were being read, so ${budgetShownBy(reader)} not shown. Try again.`,
      describe: (error) => describeBudgetFailure(reader, error),
    },
  )
  return rows.map((r) => ({ ...r, budget_cents: r.budget_cents === null ? null : Number(r.budget_cents) }))
}

export interface BudgetEdit {
  readonly userId: string
  readonly categoryId: string
  /** The first day of the month it is typed on. */
  readonly month: string
  readonly applies: 'onward' | 'only'
  /** Null is "no budget" (Clear budget), which is not $0. */
  readonly budgetCents: number | null
  /**
   * The month already has its own "just this month" value, which would go on
   * winning there over one typed "from this month on" (D12). With this set,
   * it is given the same value in the same write, so the month typed on
   * shows what was typed.
   */
  readonly replacesOnly: boolean
}

/**
 * Type a budget or goal on a month, as the owner meant it (0008, D12).
 *
 * A plain upsert under RLS on 0008's key, so typing over a value replaces it
 * and never adds a second. Nothing is copied into other months; core
 * resolves each month on read. One statement, so the "just this month" row
 * it may also replace changes with it or not at all.
 */
export async function setBudget(supabase: SupabaseClient, edit: BudgetEdit): Promise<void> {
  const row = (applies: BudgetEdit['applies']) => ({
    user_id: edit.userId,
    category_id: edit.categoryId,
    month: edit.month,
    applies,
    budget_cents: edit.budgetCents,
  })
  const rows = edit.applies === 'onward' && edit.replacesOnly ? [row('onward'), row('only')] : [row(edit.applies)]
  const { error } = await supabase
    .from('category_budgets')
    .upsert(rows, { onConflict: 'user_id,category_id,month,applies' })
  if (error !== null) throw new Error(describeBudgetFailure('save', error))
}

// ---------------------------------------------------------------------------
// Monthly amounts and days paid, from a month on (migration 0009)
// ---------------------------------------------------------------------------

/** One monthly amount as it was typed. Which one is in effect is core's to say (resolvePlans). */
export interface PlanRow {
  readonly id: string
  readonly category_id: string
  /** The first day of the first month it applies to. */
  readonly effective_month: string
  /** Null is "stopped from this month", which is not $0. */
  readonly planned_cents: number | null
  /** The workbook's Day Paid, 1–31, or null when none was typed. */
  readonly due_day: number | null
}

/**
 * Every monthly amount typed from the month starting `through` or before it,
 * read whole (readAll): everything that month's amounts can come from.
 * `reader` words a failure for the screen asking: Setup ('read') still shows
 * its lists, the Month ('month') shows nothing.
 */
export async function listPlanHistory(
  supabase: SupabaseClient,
  through: string,
  reader: Exclude<PlanAction, 'save'>,
): Promise<readonly PlanRow[]> {
  const rows = await readAll<PlanRow>(
    (from, to) =>
      supabase
        .from('category_plans')
        .select('id, category_id, effective_month, planned_cents, due_day', { count: 'exact' })
        .lte('effective_month', through)
        .order('effective_month', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: `Your monthly amounts changed while they were being read, so ${shownBy(reader)} not shown. Try again.`,
      describe: (error) => describePlanFailure(reader, error),
    },
  )
  return rows.map((r) => ({
    ...r,
    planned_cents: r.planned_cents === null ? null : Number(r.planned_cents),
    due_day: r.due_day === null ? null : Number(r.due_day),
  }))
}

export interface PlanEdit {
  readonly userId: string
  readonly categoryId: string
  /** The first day of the month it applies from. */
  readonly month: string
  /** Null stops it from this month on, which is not $0. */
  readonly plannedCents: number | null
  readonly dueDay: number | null
}

/**
 * Set a bill's monthly amount and day paid from a month on (0009, D13).
 *
 * A plain upsert under RLS on 0009's key, so typing over this month's row
 * replaces it and never adds a second; earlier months keep theirs. Both
 * columns go in every write, the one not being changed as its field in
 * Setup holds it, which may be typed and not yet read back: a row for this
 * month that left out the day paid would blank it from here on.
 */
export async function setPlan(supabase: SupabaseClient, edit: PlanEdit): Promise<void> {
  const { error } = await supabase.from('category_plans').upsert(
    {
      user_id: edit.userId,
      category_id: edit.categoryId,
      effective_month: edit.month,
      planned_cents: edit.plannedCents,
      due_day: edit.dueDay,
    },
    { onConflict: 'user_id,category_id,effective_month' },
  )
  if (error !== null) throw new Error(describePlanFailure('save', error))
}

// ---------------------------------------------------------------------------
// When each income source pays (migration 0011)
// ---------------------------------------------------------------------------

/** How often an income source pays, as 0011's enum spells it. */
export type PayFrequency = 'weekly' | 'biweekly' | 'monthly'

/** One income source's schedule as it was typed. Its periods are core's to work out (payPeriod). */
export interface PayScheduleRow {
  readonly id: string
  readonly category_id: string
  /** A payday the others are counted from. */
  readonly first_pay_date: string
  readonly frequency: PayFrequency
}

/**
 * Every pay schedule, read whole: one per income source at most (0011's
 * key), so a handful. `reader` words a failure for the screen asking.
 */
export async function listPaySchedules(
  supabase: SupabaseClient,
  reader: Exclude<ScheduleAction, 'save'>,
): Promise<readonly PayScheduleRow[]> {
  return readAll<PayScheduleRow>(
    (from, to) =>
      supabase
        .from('pay_schedules')
        .select('id, category_id, first_pay_date, frequency', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: `When you are paid changed while it was being read, so ${scheduleShownBy(reader)} not shown. Try again.`,
      describe: (error) => describeScheduleFailure(reader, error),
    },
  )
}

export interface ScheduleEdit {
  readonly userId: string
  readonly categoryId: string
  readonly firstPayDate: string
  readonly frequency: PayFrequency
}

/**
 * Set when an income source pays. A plain upsert under RLS on 0011's key,
 * so typing over a schedule replaces it and never adds a second.
 */
export async function setPaySchedule(supabase: SupabaseClient, edit: ScheduleEdit): Promise<void> {
  const { error } = await supabase.from('pay_schedules').upsert(
    { user_id: edit.userId, category_id: edit.categoryId, first_pay_date: edit.firstPayDate, frequency: edit.frequency },
    { onConflict: 'user_id,category_id' },
  )
  if (error !== null) throw new Error(describeScheduleFailure('save', error))
}

/** Forget when an income source pays: 0011 stores no half schedule, so none is a missing row. */
export async function removePaySchedule(supabase: SupabaseClient, categoryId: string): Promise<void> {
  const { error } = await supabase.from('pay_schedules').delete().eq('category_id', categoryId)
  if (error !== null) throw new Error(describeScheduleFailure('save', error))
}

// ---------------------------------------------------------------------------
// The bank balance a month started with (migration 0010)
// ---------------------------------------------------------------------------

/** A month's starting balance as it was typed. Signed: an overdrawn month starts below zero. */
export interface MonthBalanceRow {
  readonly id: string
  /** The first day of the month. */
  readonly month: string
  readonly starting_balance_cents: number
}

/**
 * The starting balance typed for the month beginning `month`, or null when
 * none was (D17). That month's alone: the workbook has it typed on every tab
 * (Jan!D9), never carried from the month before.
 */
export async function getMonthBalance(supabase: SupabaseClient, month: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('month_balances')
    .select('starting_balance_cents')
    .eq('month', month)
    .maybeSingle()
  if (error !== null) throw new Error(describeBalanceFailure('read', error))
  return data === null ? null : Number((data as Pick<MonthBalanceRow, 'starting_balance_cents'>).starting_balance_cents)
}

export interface BalanceEdit {
  readonly userId: string
  /** The first day of the month. */
  readonly month: string
  /** Null clears it. */
  readonly startingBalanceCents: number | null
}

/**
 * Type, retype or clear the bank balance a month started with (0010).
 *
 * A plain upsert under RLS on 0010's key, so typing over a balance replaces
 * it. Clearing deletes the row: 0010 stores no blank balance, so a month
 * with none has no row, and core shows it no ending balance (D17).
 */
export async function setMonthBalance(supabase: SupabaseClient, edit: BalanceEdit): Promise<void> {
  const { error } =
    edit.startingBalanceCents === null
      ? await supabase.from('month_balances').delete().eq('month', edit.month)
      : await supabase
          .from('month_balances')
          .upsert(
            { user_id: edit.userId, month: edit.month, starting_balance_cents: edit.startingBalanceCents },
            { onConflict: 'user_id,month' },
          )
  if (error !== null) throw new Error(describeBalanceFailure('save', error))
}

// ---------------------------------------------------------------------------
// The goals
// ---------------------------------------------------------------------------

export interface GoalRow {
  readonly id: string
  readonly name: string
  readonly target_cents: number
  readonly saved_cents: number
  readonly target_date: string | null
  readonly unit_cost_cents: number | null
  readonly unit_label: string | null
}

/** A goal with its place and state (0015), as the app lists every goal. */
export interface ListedGoalRow extends GoalRow {
  /** When it was made (0004); breaks a tie in place (F45). */
  readonly created_at: string
  readonly sort_order: number
  readonly status: GoalStatus
  /** The day it was marked reached; null unless it is. */
  readonly reached_on: string | null
}

export interface GoalsRead {
  readonly goals: readonly ListedGoalRow[]
  /**
   * Whether 0015 is in. Before it, every goal reads as active at place 0,
   * which is what 0015 makes of each, and nothing that places a goal or
   * changes its state can be saved.
   */
  readonly ordered: boolean
}

/**
 * Every goal, read whole: a handful, as the one goal read before them was.
 * 0015's columns are asked for; when they are not there yet (42703) the
 * goals are read as before it, so a missing update never takes the first
 * load down, and the goal that leads is still the oldest (F45).
 */
export async function listGoals(supabase: SupabaseClient): Promise<GoalsRead> {
  const placed = await supabase
    .from('savings_goals')
    .select('id, name, target_cents, saved_cents, target_date, unit_cost_cents, unit_label, created_at, sort_order, status, reached_on')
    .order('created_at')
    .order('id')
  if (placed.error === null) return { goals: ((placed.data ?? []) as ListedGoalRow[]).map(goalNumbers), ordered: true }
  if (placed.error.code !== '42703') fail(placed.error)
  const before = await supabase
    .from('savings_goals')
    .select('id, name, target_cents, saved_cents, target_date, unit_cost_cents, unit_label, created_at')
    .order('created_at')
    .order('id')
  if (before.error !== null) fail(before.error)
  const rows = (before.data ?? []) as (GoalRow & { readonly created_at: string })[]
  return {
    goals: rows.map((g) => goalNumbers({ ...g, sort_order: 0, status: 'active', reached_on: null })),
    ordered: false,
  }
}

/** bigint columns arrive as numbers or strings, so each is made a number. */
function goalNumbers(g: ListedGoalRow): ListedGoalRow {
  return {
    ...g,
    target_cents: Number(g.target_cents),
    saved_cents: Number(g.saved_cents),
    unit_cost_cents: g.unit_cost_cents === null ? null : Number(g.unit_cost_cents),
    sort_order: Number(g.sort_order),
  }
}

// ---------------------------------------------------------------------------
// Savings funds (migration 0013)
// ---------------------------------------------------------------------------

/** A goal as the Savings screen reads it: the goal, plus which fund it is and when (0013). */
export interface FundRow extends GoalRow {
  /** The Savings-list category it is the fund for; null for a goal on no fund. */
  readonly category_id: string | null
  /** Savings!N14, the Start Date. */
  readonly start_date: string | null
  /** The day `saved_cents` was true; transfers after it add to the balance (D16). */
  readonly balance_as_of: string | null
}

/** Every goal, oldest first, read whole: one per fund at most (0013), so a handful. */
export async function listFunds(supabase: SupabaseClient): Promise<readonly FundRow[]> {
  const rows = await readAll<FundRow>(
    (from, to) =>
      supabase
        .from('savings_goals')
        .select(
          'id, name, target_cents, saved_cents, target_date, unit_cost_cents, unit_label, category_id, start_date, balance_as_of',
          { count: 'exact' },
        )
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: 'Your savings goals changed while they were being read, so they are not shown. Try again.',
      describe: (error) => describeFundFailure('read', error),
    },
  )
  return rows.map((g) => ({
    ...g,
    target_cents: Number(g.target_cents),
    saved_cents: Number(g.saved_cents),
    unit_cost_cents: g.unit_cost_cents === null ? null : Number(g.unit_cost_cents),
  }))
}

/**
 * The funds' ledger rows from `from` to `to`, inclusive, read whole. Core
 * counts only those after each fund's own typed day (fundBalance), so
 * `from` is the earliest of those days and a row on it is left to core.
 */
export async function listFundTransfers(
  supabase: SupabaseClient,
  categoryIds: readonly string[],
  range: { readonly from: string; readonly to: string },
): Promise<readonly LedgerRow[]> {
  if (categoryIds.length === 0) return []
  const rows = await readAll<LedgerRow>(
    (from, to) =>
      supabase
        .from('transactions')
        .select('id, posted_on, amount_cents, merchant_raw, category_id, source', { count: 'exact' })
        .in('category_id', [...categoryIds])
        .gte('posted_on', range.from)
        .lte('posted_on', range.to)
        .order('posted_on', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: 'Money moved to savings while your funds were being read, so they are not shown. Try again.',
      describe: (error) => describeFundFailure('read', error),
    },
  )
  return rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }))
}

export interface FundEdit {
  readonly goalCents: number
  /** What is in the fund today, typed; true at the end of `asOf` (D16). */
  readonly savedCents: number
  readonly asOf: string
  readonly startDate: string | null
  readonly goalDate: string | null
  /** What an hour costs and what the hours are of; both null for a goal in dollars (F45). */
  readonly unitCostCents: number | null
  readonly unitLabel: string | null
}

/**
 * Save a fund's goal. The typed balance and the day it is true are always
 * written together (N52): a balance retyped without moving its day would
 * count the transfers since the old day twice. A new goal takes its fund's
 * name, which 0004 keeps unique among goals.
 */
export async function saveFund(
  supabase: SupabaseClient,
  /** A goal on no fund has no category; it is only ever edited, never made, here. */
  target: { readonly userId: string; readonly categoryId: string | null; readonly name: string; readonly goalId: string | null },
  edit: FundEdit,
): Promise<void> {
  const row = {
    target_cents: edit.goalCents,
    saved_cents: edit.savedCents,
    balance_as_of: edit.asOf,
    start_date: edit.startDate,
    target_date: edit.goalDate,
    unit_cost_cents: edit.unitCostCents,
    unit_label: edit.unitLabel,
  }
  const { error } =
    target.goalId === null
      ? await supabase
          .from('savings_goals')
          .insert({ user_id: target.userId, name: target.name, category_id: target.categoryId, ...row })
      : await supabase.from('savings_goals').update(row).eq('id', target.goalId)
  if (error !== null) throw new Error(describeFundFailure('save', error))
}

/**
 * Make a goal on no fund the fund for `categoryId`, its typed amount true as
 * of `asOf`: transfers already recorded are taken to be in it, and later
 * ones add to it (D16).
 */
export async function linkFund(
  supabase: SupabaseClient,
  link: { readonly goalId: string; readonly categoryId: string; readonly asOf: string },
): Promise<void> {
  const { error } = await supabase
    .from('savings_goals')
    .update({ category_id: link.categoryId, balance_as_of: link.asOf })
    .eq('id', link.goalId)
  if (error !== null) throw new Error(describeFundFailure('save', error))
}

// ---------------------------------------------------------------------------
// Debts (migration 0014)
// ---------------------------------------------------------------------------

/** A debt as typed on the Debts screen: Debt Calculator!J18:J20 and its start month. */
export interface DebtRow {
  readonly id: string
  readonly name: string
  readonly starting_balance_cents: number
  readonly minimum_payment_cents: number
  /** Hundredths of a percent: 19.99% is 1999. */
  readonly apr_basis_points: number
  /** The first of the month the starting balance is as of. */
  readonly start_date: string
  readonly sort_order: number
}

/** A one-off extra payment on a debt, in the month it is paid (I26:I494). */
export interface DebtExtraRow {
  readonly id: string
  readonly debt_id: string
  readonly month: string
  readonly amount_cents: number
}

/** Every debt, in the Debts screen's order, read whole. */
export async function listDebts(supabase: SupabaseClient): Promise<readonly DebtRow[]> {
  const rows = await readAll<DebtRow>(
    (from, to) =>
      supabase
        .from('debts')
        .select('id, name, starting_balance_cents, minimum_payment_cents, apr_basis_points, start_date, sort_order', { count: 'exact' })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: 'Your debts changed while they were being read, so they are not shown. Try again.',
      describe: (error) => describeDebtFailure('read', error),
    },
  )
  return rows.map((d) => ({
    ...d,
    starting_balance_cents: Number(d.starting_balance_cents),
    minimum_payment_cents: Number(d.minimum_payment_cents),
  }))
}

/** Every extra payment on every debt, read whole. */
export async function listDebtExtras(supabase: SupabaseClient): Promise<readonly DebtExtraRow[]> {
  const rows = await readAll<DebtExtraRow>(
    (from, to) =>
      supabase
        .from('debt_extra_payments')
        .select('id, debt_id, month, amount_cents', { count: 'exact' })
        .order('month', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    {
      changed: 'Your extra payments changed while they were being read, so your debts are not shown. Try again.',
      describe: (error) => describeDebtFailure('read', error),
    },
  )
  return rows.map((e) => ({ ...e, amount_cents: Number(e.amount_cents) }))
}

export interface DebtEdit {
  readonly name: string
  readonly startingBalanceCents: number
  readonly minimumPaymentCents: number
  readonly aprBasisPoints: number
  /** The first of the month the balance is as of. */
  readonly startMonth: string
}

/** Add a debt at the end of the list (`sortOrder`), or change one. */
export async function saveDebt(
  supabase: SupabaseClient,
  target: { readonly userId: string; readonly debtId: string | null; readonly sortOrder: number },
  edit: DebtEdit,
): Promise<void> {
  const row = {
    name: edit.name,
    starting_balance_cents: edit.startingBalanceCents,
    minimum_payment_cents: edit.minimumPaymentCents,
    apr_basis_points: edit.aprBasisPoints,
    start_date: edit.startMonth,
  }
  const { error } =
    target.debtId === null
      ? await supabase.from('debts').insert({ user_id: target.userId, sort_order: target.sortOrder, ...row })
      : await supabase.from('debts').update(row).eq('id', target.debtId)
  if (error !== null) throw new Error(describeDebtFailure('save', error))
}

/** Remove a debt; its extra payments go with it (0014: ON DELETE CASCADE). */
export async function removeDebt(supabase: SupabaseClient, debtId: string): Promise<void> {
  const { error } = await supabase.from('debts').delete().eq('id', debtId)
  if (error !== null) throw new Error(describeDebtFailure('save', error))
}

/** Set a debt's extra payment for a month; one per debt a month, as the workbook has one cell. */
export async function saveDebtExtra(
  supabase: SupabaseClient,
  extra: { readonly userId: string; readonly debtId: string; readonly month: string; readonly amountCents: number },
): Promise<void> {
  const { error } = await supabase
    .from('debt_extra_payments')
    .upsert(
      { user_id: extra.userId, debt_id: extra.debtId, month: extra.month, amount_cents: extra.amountCents },
      { onConflict: 'user_id,debt_id,month' },
    )
  if (error !== null) throw new Error(describeDebtFailure('extra', error))
}

export async function removeDebtExtra(supabase: SupabaseClient, extraId: string): Promise<void> {
  const { error } = await supabase.from('debt_extra_payments').delete().eq('id', extraId)
  if (error !== null) throw new Error(describeDebtFailure('extra', error))
}
