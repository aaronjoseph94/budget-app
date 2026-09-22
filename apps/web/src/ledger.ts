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

export type IngestSource = 'card_csv' | 'card_xlsx' | 'receipt_photo' | 'typed'

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
  }
}

/** What save_import returns. Shaped by migration 0003. */
interface SavedCounts {
  readonly batch_id: string
  readonly parsed: number
  readonly deduped: number
  readonly inserted: number
  readonly rejected: number
}

export interface PendingCandidate {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  readonly merchant_raw: string
  readonly dedupe_hash: string
  readonly dedupe_hash_v: number
  readonly account_id: string
  readonly source: string
}

export async function listPending(
  supabase: SupabaseClient,
  limit = 200,
): Promise<readonly PendingCandidate[]> {
  const { data, error } = await supabase
    .from('ingest_candidates')
    .select('id, posted_on, amount_cents, merchant_raw, dedupe_hash, dedupe_hash_v, account_id, source')
    .eq('status', 'pending')
    .order('posted_on', { ascending: false })
    .limit(limit)
  if (error !== null) throw new Error(describeWriteFailure(error))
  return (data ?? []) as readonly PendingCandidate[]
}

export type ApproveOutcome = 'approved' | 'already_handled' | 'already_in_ledger'

/**
 * Approve one candidate into the ledger.
 *
 * Two guards, both required by CLAUDE.md and both enforced by the database
 * rather than by checking first:
 *
 *   - The status change is conditional (`WHERE id = ? AND status = 'pending'`)
 *     and returns the row. A second approval of the same candidate matches
 *     nothing and returns nothing, so a double click cannot post twice.
 *   - The insert is `ON CONFLICT (user_id, dedupe_hash) DO NOTHING`. A charge
 *     already in the ledger adds no row. A SELECT-then-INSERT would race with
 *     itself; this cannot.
 */
export async function approveCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  categoryId: string,
): Promise<ApproveOutcome> {
  const { data: claimed, error: claimError } = await supabase
    .from('ingest_candidates')
    .update({ status: 'approved', category_id: categoryId, category_source: 'user' })
    .eq('id', candidateId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle()
  if (claimError !== null) throw new Error(describeWriteFailure(claimError))
  if (claimed === null) return 'already_handled'

  const row = claimed as unknown as PendingCandidate & { user_id: string }
  const { data: written, error: insertError } = await supabase
    .from('transactions')
    .upsert(
      {
        user_id: row.user_id,
        account_id: row.account_id,
        posted_on: row.posted_on,
        amount_cents: row.amount_cents,
        merchant: row.merchant_raw,
        merchant_raw: row.merchant_raw,
        category_id: categoryId,
        dedupe_hash: row.dedupe_hash,
        dedupe_hash_v: row.dedupe_hash_v,
        source: row.source,
      },
      { onConflict: 'user_id,dedupe_hash', ignoreDuplicates: true },
    )
    .select('id')
  if (insertError !== null) throw new Error(describeWriteFailure(insertError))

  return (written ?? []).length === 0 ? 'already_in_ledger' : 'approved'
}

export interface NamedRow {
  readonly id: string
  readonly name: string
}

/**
 * Find or create a row by name for this user.
 *
 * Both tables are unique on (user_id, name), so a repeated call returns the
 * same row rather than creating a second one — the uniqueness is the
 * database's, not a check performed first that could race.
 */
async function ensureNamed(
  supabase: SupabaseClient,
  table: 'accounts' | 'categories',
  userId: string,
  name: string,
): Promise<NamedRow> {
  const { data: found, error: findError } = await supabase
    .from(table)
    .select('id, name')
    .eq('name', name)
    .maybeSingle()
  if (findError !== null) throw new Error(describeWriteFailure(findError))
  if (found !== null) return found as NamedRow

  const { data: created, error: createError } = await supabase
    .from(table)
    .insert({ user_id: userId, name })
    .select('id, name')
    .single()
  if (createError !== null) throw new Error(describeWriteFailure(createError))
  return created as NamedRow
}

export const ensureAccount = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'accounts', userId, name)

export const ensureCategory = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'categories', userId, name)

export async function listCategories(supabase: SupabaseClient): Promise<readonly NamedRow[]> {
  const { data, error } = await supabase.from('categories').select('id, name').order('name')
  if (error !== null) throw new Error(describeWriteFailure(error))
  return (data ?? []) as readonly NamedRow[]
}

export interface LedgerRow {
  readonly id: string
  readonly posted_on: string
  readonly amount_cents: number
  readonly merchant_raw: string
}

export async function listTransactions(
  supabase: SupabaseClient,
  limit = 200,
): Promise<readonly LedgerRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, posted_on, amount_cents, merchant_raw')
    .order('posted_on', { ascending: false })
    .limit(limit)
  if (error !== null) throw new Error(describeWriteFailure(error))
  return (data ?? []) as readonly LedgerRow[]
}
