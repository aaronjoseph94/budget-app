/**
 * `suggest_review_categories` (ADR 0013, PROPOSALS.md §3): a category for
 * rows waiting in Review, kept on each row as the app's own AI keeps its
 * suggestion (0018): only on the owner's rows still waiting that nobody
 * filled, only in the owner's categories not on Not spending. Review shows
 * each as the AI's suggestion, and the owner still approves every row; no
 * tool approves. Names are matched as list_categories hands them out, from
 * one read, then one ai_app_suggest_categories (0039), counted as a
 * suggestion.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { isoDate } from '@budget/core'
import { SuggestReviewCategoriesInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName } from '../money.js'
import { ADDS, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller, type RefusalCode } from '../rpc.js'
import { categoriesFrom } from '../rows.js'
import { utcToday } from '../windows.js'

export type SuggestReviewCategoriesInput = z.output<typeof SuggestReviewCategoriesInputSchema>

export const DESCRIPTION =
  'Suggest a category for rows waiting in Review, by each row\'s `id` from list_review_queue and a category name ' +
  'as list_categories gives it (never Not spending). The owner sees each as a suggestion and still approves every ' +
  'row; you cannot. A row the owner or a learned rule already filled, or one no longer waiting, is skipped. At most ' +
  '50 at once. Returns as_of, suggested, skipped and message.'

const MESSAGE = 'Each suggested category waits on its row in Review until the owner approves the row, or picks another.'

function refused(code: RefusalCode): CallToolResult {
  log('tool_suggest_review_categories_refused')
  return refusal(code)
}

export async function suggestReviewCategories(caller: Caller | null, input: SuggestReviewCategoriesInput): Promise<CallToolResult> {
  if (caller === null) return refusal('server_error')
  const day = utcToday()
  const read = await rpc(caller, 'ai_app_read', { p_parts: ['categories'], p_from: day, p_to: day })
  if (isRefusal(read)) return refused(read.refused)
  let ids: Map<string, string>
  let today
  try {
    today = isoDate(String(read['today']))
    ids = new Map(categoriesFrom(read['categories']).flatMap((c) => (c.kind === 'transfer' ? [] : [[cleanName(c.name), c.id] as const])))
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  const items = input.suggestions.map((s) => ({ candidate: s.id, category: ids.get(s.category) }))
  if (items.some((i) => i.category === undefined)) return refused('unknown_category')
  const done = await rpc(caller, 'ai_app_suggest_categories', { p: items })
  if (isRefusal(done)) return refused(done.refused)
  const suggested = Number(done['suggested'])
  const skipped = Number(done['skipped'])
  if (!Number.isSafeInteger(suggested) || !Number.isSafeInteger(skipped)) {
    log('rpc_shape')
    return refused('server_error')
  }
  log('tool_suggest_review_categories_ok', { suggested, skipped })
  return answer({ as_of: today, suggested, skipped, message: MESSAGE })
}

export function registerSuggestReviewCategories(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'suggest_review_categories',
    { title: 'Suggest Review categories', description: DESCRIPTION, inputSchema: SuggestReviewCategoriesInputSchema, annotations: ADDS, _meta: SIGNED_IN },
    (input) => suggestReviewCategories(caller, input),
  )
}
