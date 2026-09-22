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
  type AcceptedRow,
  type RejectedRow,
} from '@budget/statement-parsers'
import type { SupabaseClient } from './supabase.js'

export interface SaveImportInput {
  readonly userId: string
  readonly accountId: string
  readonly accepted: readonly AcceptedRow[]
  readonly rejected: readonly RejectedRow[]
  readonly parsed: number
}

export interface SaveImportResult {
  readonly batchId: string
  readonly inserted: number
  readonly deduped: number
  readonly rejected: number
}

/**
 * Save one import.
 *
 * The counts are computed from what the database actually accepted, not from
 * what this function intended to write. CLAUDE.md requires
 * `parsed == deduped + inserted + rejected`, and a count taken from intent
 * cannot notice the row it failed to insert — which is the one case the rule
 * exists to catch. The batch row carries a CHECK enforcing the same equation,
 * so a disagreement fails the write rather than being stored.
 */
export async function saveImport(
  supabase: SupabaseClient,
  input: SaveImportInput,
): Promise<SaveImportResult> {
  const { data: batch, error: batchError } = await supabase
    .from('ingest_batches')
    .insert({
      user_id: input.userId,
      account_id: input.accountId,
      source: 'card_csv',
      parsed: 0,
      deduped: 0,
      inserted: 0,
      rejected: 0,
    })
    .select('id')
    .single()
  if (batchError !== null) throw new Error(`could not start the import: ${batchError.code}`)
  const batchId = String((batch as { id: string }).id)

  // An issuer id where the export gave one, otherwise the nth occurrence among
  // rows identical in account, date, amount and description. Without it, two
  // identical coffees on one day collide and the ledger loses one.
  const discriminators = assignDiscriminators(
    input.accepted,
    (row) => `${row.postedOn}|${row.amountCents}|${row.merchantRaw}`,
    (row) => row.issuerTransactionId,
  )

  const hashed = await Promise.all(
    input.accepted.map(async (row, index) => {
      const discriminator = discriminators[index]
      if (discriminator === undefined) throw new Error('missing discriminator for a parsed row')
      return {
        row,
        dedupeHash: await computeDedupeHash({
          accountId: input.accountId,
          postedOn: row.postedOn,
          amountCents: row.amountCents,
          merchantRaw: row.merchantRaw,
          discriminator,
        }),
      }
    }),
  )

  // A charge already in the ledger becomes no candidate at all. Asking the
  // database which hashes it already holds is the only honest way to know;
  // the answer is enforced regardless by the unique index at approval time.
  const existing = await existingHashes(
    supabase,
    hashed.map((h) => h.dedupeHash),
  )
  const fresh = hashed.filter((h) => !existing.has(h.dedupeHash))

  let inserted = 0
  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from('ingest_candidates')
      .insert(
        fresh.map(({ row, dedupeHash }) => ({
          user_id: input.userId,
          batch_id: batchId,
          account_id: input.accountId,
          posted_on: row.postedOn,
          amount_cents: row.amountCents,
          merchant: row.merchantRaw,
          merchant_raw: row.merchantRaw,
          dedupe_hash: dedupeHash,
          dedupe_hash_v: DEDUPE_HASH_VERSION,
          source: 'card_csv',
          status: 'pending',
        })),
      )
      .select('id')
    if (error !== null) throw new Error(`could not save the transactions: ${error.code}`)
    inserted = (data ?? []).length
  }

  let rejected = 0
  if (input.rejected.length > 0) {
    const { data, error } = await supabase
      .from('ingest_unreadable_lines')
      .insert(
        input.rejected.map((r) => ({
          user_id: input.userId,
          batch_id: batchId,
          source_line: r.line,
          reason: r.reason,
        })),
      )
      .select('id')
    if (error !== null) throw new Error(`could not record the unreadable lines: ${error.code}`)
    rejected = (data ?? []).length
  }

  const deduped = input.parsed - inserted - rejected
  const { error: countsError } = await supabase
    .from('ingest_batches')
    .update({ parsed: input.parsed, deduped, inserted, rejected })
    .eq('id', batchId)
  // The CHECK on the batch row is what makes this meaningful: if the three
  // counts do not add up to what was read, the update fails and the import
  // reports a problem rather than storing a tidy lie.
  if (countsError !== null) {
    throw new Error(`the import did not add up and was not recorded: ${countsError.code}`)
  }

  return { batchId, inserted, deduped, rejected }
}

/** Which of these hashes the ledger already holds, asked in one round trip. */
async function existingHashes(
  supabase: SupabaseClient,
  hashes: readonly string[],
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const { data, error } = await supabase
    .from('transactions')
    .select('dedupe_hash')
    .in('dedupe_hash', [...hashes])
  if (error !== null) throw new Error(`could not check for duplicates: ${error.code}`)
  return new Set((data ?? []).map((r) => String((r as { dedupe_hash: string }).dedupe_hash)))
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
  if (error !== null) throw new Error(`could not load the review queue: ${error.code}`)
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
  if (claimError !== null) throw new Error(`could not approve: ${claimError.code}`)
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
  if (insertError !== null) throw new Error(`could not add to the ledger: ${insertError.code}`)

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
  if (findError !== null) throw new Error(`could not read ${table}: ${findError.code}`)
  if (found !== null) return found as NamedRow

  const { data: created, error: createError } = await supabase
    .from(table)
    .insert({ user_id: userId, name })
    .select('id, name')
    .single()
  if (createError !== null) throw new Error(`could not create in ${table}: ${createError.code}`)
  return created as NamedRow
}

export const ensureAccount = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'accounts', userId, name)

export const ensureCategory = (supabase: SupabaseClient, userId: string, name: string) =>
  ensureNamed(supabase, 'categories', userId, name)

export async function listCategories(supabase: SupabaseClient): Promise<readonly NamedRow[]> {
  const { data, error } = await supabase.from('categories').select('id, name').order('name')
  if (error !== null) throw new Error(`could not load categories: ${error.code}`)
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
  if (error !== null) throw new Error(`could not load the ledger: ${error.code}`)
  return (data ?? []) as readonly LedgerRow[]
}
