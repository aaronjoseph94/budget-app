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
} from '@budget/statement-parsers'
import { describeWriteFailure } from './format.js'
import type { SupabaseClient } from './supabase.js'

export type IngestSource = 'card_csv' | 'card_xlsx' | 'card_pdf' | 'receipt_photo' | 'typed'

export interface SaveImportInput {
  readonly userId: string
  readonly accountId: string
  readonly accepted: readonly AcceptedRow[]
  readonly rejected: readonly RejectedRow[]
  readonly parsed: number
  /** Where the rows came from. Was hardcoded to card_csv, which a PDF is not. */
  readonly source: IngestSource
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

  const { data, error } = await supabase.rpc('save_import', {
    p_account_id: input.accountId,
    p_source: input.source,
    p_parsed: input.parsed,
    p_rows: rows,
    p_unreadable: input.rejected.map((r) => ({ source_line: r.line, reason: r.reason })),
  })
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
    .select('id, posted_on, amount_cents, merchant, merchant_raw', { count: 'exact' })
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
 * Lines the imports since `since` could not read, grouped by the import.
 *
 * Two reads rather than an embedded join, so each is a plain query the fake
 * test server answers the way PostgREST does. The browser keeps SELECT on both
 * tables (0004 revoked only the writes), and RLS scopes both to the owner.
 */
export async function listUnreadable(
  supabase: SupabaseClient,
  since: string,
  limit = 200,
): Promise<UnreadablePage> {
  const recent = await supabase
    .from('ingest_batches')
    .select('id, source, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)
  if (recent.error !== null) fail(recent.error)
  const batches = (recent.data ?? []) as UnreadableBatch[]
  if (batches.length === 0) return { batches: [], lines: [], total: 0 }

  const { data, error, count } = await supabase
    .from('ingest_unreadable_lines')
    .select('batch_id, source_line, reason', { count: 'exact' })
    .in('batch_id', batches.map((b) => b.id))
    .order('source_line', { ascending: true })
    .limit(limit)
  if (error !== null) fail(error)
  const lines = ((data ?? []) as UnreadableLine[]).map((l) => ({ ...l, source_line: Number(l.source_line) }))
  const withLines = new Set(lines.map((l) => l.batch_id))
  return { batches: batches.filter((b) => withLines.has(b.id)), lines, total: count ?? lines.length }
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
  /** Null when no weekly limit is set, which is not the same as zero. */
  readonly weekly_budget_cents: number | null
}

/**
 * Find or create a row by name.
 *
 * Insert first, and read back only on a unique violation. The previous version
 * looked first and inserted second, while its comment claimed the database's
 * uniqueness made that race-safe; it did not — two quick taps both looked,
 * both found nothing, and the second insert failed with a raw 23505. Here the
 * violation IS the "already exists" answer.
 */
async function ensureNamed(
  supabase: SupabaseClient,
  table: 'accounts' | 'categories',
  userId: string,
  name: string,
): Promise<NamedRow> {
  const { data: created, error: createError } = await supabase
    .from(table)
    .insert({ user_id: userId, name })
    .select('id, name')
    .single()
  if (createError === null) return created as NamedRow
  if (createError.code !== '23505') fail(createError)

  const { data: found, error: findError } = await supabase
    .from(table)
    .select('id, name')
    .eq('name', name)
    .single()
  if (findError !== null) fail(findError)
  return found as NamedRow
}

export const ensureAccount = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'accounts', userId, name)

export const ensureCategory = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'categories', userId, name)

export async function listCategories(supabase: SupabaseClient): Promise<readonly Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, weekly_budget_cents')
    .order('name')
  if (error !== null) fail(error)
  return ((data ?? []) as Category[]).map((c) => ({
    ...c,
    weekly_budget_cents: c.weekly_budget_cents === null ? null : Number(c.weekly_budget_cents),
  }))
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

/** Ledger rows between two dates, inclusive, newest first. */
export async function listTransactions(
  supabase: SupabaseClient,
  range: { readonly from: string; readonly to: string },
): Promise<readonly LedgerRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, posted_on, amount_cents, merchant_raw, category_id, source')
    .gte('posted_on', range.from)
    .lte('posted_on', range.to)
    .order('posted_on', { ascending: false })
    .limit(2000)
  if (error !== null) fail(error)
  return ((data ?? []) as LedgerRow[]).map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }))
}

export async function deleteTransaction(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error !== null) fail(error)
}

// ---------------------------------------------------------------------------
// The goal
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

export async function getGoal(supabase: SupabaseClient): Promise<GoalRow | null> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select('id, name, target_cents, saved_cents, target_date, unit_cost_cents, unit_label')
    .order('created_at')
    .limit(1)
    .maybeSingle()
  if (error !== null) fail(error)
  if (data === null) return null
  const g = data as GoalRow
  return {
    ...g,
    target_cents: Number(g.target_cents),
    saved_cents: Number(g.saved_cents),
    unit_cost_cents: g.unit_cost_cents === null ? null : Number(g.unit_cost_cents),
  }
}

export interface GoalInput {
  readonly name: string
  readonly targetCents: number
  readonly savedCents: number
  readonly targetDate: string | null
  readonly unitCostCents: number | null
  readonly unitLabel: string | null
}

/**
 * Create the goal, or update it by id.
 *
 * By id, not by name: upserting on (user_id, name) meant renaming the goal
 * created a second one, and the week screen went on showing the first.
 */
export async function saveGoal(
  supabase: SupabaseClient,
  userId: string,
  goal: GoalInput,
  existingId: string | null,
): Promise<void> {
  const row = {
    name: goal.name,
    target_cents: goal.targetCents,
    saved_cents: goal.savedCents,
    target_date: goal.targetDate,
    unit_cost_cents: goal.unitCostCents,
    unit_label: goal.unitLabel,
  }
  const { error } =
    existingId === null
      ? await supabase.from('savings_goals').insert({ user_id: userId, ...row })
      : await supabase.from('savings_goals').update(row).eq('id', existingId)
  if (error !== null) fail(error)
}
