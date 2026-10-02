import type { SupabaseClient } from './supabase.js'
import { describeWriteFailure } from './format.js'
import { readAll } from './ledger.js'

/**
 * The shops the app has learned to file by themselves: merchant_rules,
 * one per shop, each naming its category (0001). Approving a charge, or
 * moving one with "Always file" ticked, writes one (0004, 0006).
 *
 * Forgetting one is a plain delete under 0001's own-rows policy. The shop's
 * charges stay where they are; its next ones wait in Review for a category,
 * as a shop never seen does. A category that is kept only by a shop rule
 * could not be removed, with nothing to do about it (N17): this is the
 * way to let go of it.
 */
export interface LearnedShop {
  readonly id: string
  /** Normalised, as the rule matches it. Ingested text: shown as text only. */
  readonly merchant: string
  readonly categoryId: string
}

export async function listLearnedShops(supabase: SupabaseClient): Promise<readonly LearnedShop[]> {
  // Every shop, page by page: one request stopped at the server's 1,000
  // rows, and this is the only list that can forget a shop that files
  // itself (architecture-c1-03). A read saves nothing, so it never says
  // "nothing was saved" (N28).
  const rows = await readAll<{ id: string; match_merchant: string; category_id: string }>(
    (from, to) =>
      // A shop's name is unique to its owner (0001), so it orders the pages.
      supabase.from('merchant_rules').select('id, match_merchant, category_id', { count: 'exact' }).order('match_merchant').range(from, to),
    {
      changed: 'The shops the app has learned changed while they were read. Try again.',
      describe: (error) => `The shops the app has learned could not be read just now. Try again. (code ${error?.code || 'unknown'})`,
    },
    (r) => r.match_merchant,
  )
  return rows.map((r) => ({
    id: r.id,
    merchant: r.match_merchant,
    categoryId: r.category_id,
  }))
}

export async function forgetShop(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from('merchant_rules').delete().eq('id', id)
  if (error !== null) throw new Error(describeWriteFailure(error))
}
