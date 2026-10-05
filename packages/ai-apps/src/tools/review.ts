/**
 * Tool 8, `list_review_queue` (PLAN §2.4): what waits in Review, oldest
 * first as Review shows it, with the database's counts. There is
 * deliberately no total: a sum of amounts nobody has checked yet is a
 * figure the app never shows. Approving or rejecting is the owner's, in the
 * app; no tool does either.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { isoDate } from '@budget/core'
import { ListReviewQueueInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, cleanShop, flowOf, money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'

export type ListReviewQueueInput = z.output<typeof ListReviewQueueInputSchema>

export const DESCRIPTION =
  'What waits in Review: date, shop, amount, any suggested category and who suggested it (a learned rule or a ' +
  'model), and where it came from (statement, photo, typed, AI app). Nothing here counts until approved. You ' +
  'cannot approve or reject; tell the owner to open Review. Each row\'s `id` names it to ' +
  'suggest_review_categories. Oldest first, at most `limit`; waiting counts every row, and unreadable_lines the ' +
  'statement lines the app could not read. Every amount is {cents, display}, money out below zero; quote display. ' +
  'Returns as_of, waiting, unreadable_lines, returned, rows[{id, date, shop, flow, amount, suggested_category, ' +
  'suggested_by, source, added_by_ai_app}].'

type Waiting = {
  id?: unknown
  posted_on: string
  amount_cents: number
  merchant_raw: string
  category: string | null
  category_source: string | null
  source: string
}

/** Who picked a waiting row's category: a learned rule, a model (the app's AI or an AI app), or nobody. */
const SUGGESTED_BY: Readonly<Record<string, 'rule' | 'model'>> = { merchant_rule: 'rule', model: 'model' }

/** A row's id, as 0039 adds it; null from a database before 0039. */
export const idOf = (id: unknown): string | null => (typeof id === 'string' ? id : null)

export async function listReviewQueue(caller: Caller | null, input: ListReviewQueueInput) {
  if (caller === null) return refusal('server_error')
  const queue = await rpc(caller, 'ai_app_review', { p_limit: input.limit })
  if (isRefusal(queue)) {
    log('tool_list_review_queue_refused')
    return refusal(queue.refused)
  }
  let result
  try {
    if (!Array.isArray(queue['rows'])) throw new RangeError('the waiting rows were not a list')
    const rows = queue['rows'] as readonly Waiting[]
    result = {
      as_of: isoDate(String(queue['today'])),
      waiting: Number(queue['waiting']),
      unreadable_lines: Number(queue['unreadable_lines']),
      returned: rows.length,
      rows: rows.map((r) => ({
        id: idOf(r.id),
        date: isoDate(r.posted_on),
        shop: cleanShop(r.merchant_raw),
        flow: flowOf(Number(r.amount_cents)),
        amount: money(Number(r.amount_cents)),
        suggested_category: r.category === null ? null : cleanName(r.category),
        suggested_by: r.category === null ? null : (SUGGESTED_BY[r.category_source ?? ''] ?? null),
        source: r.source,
        added_by_ai_app: r.source === 'ai_app',
      })),
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_list_review_queue_ok', { rows: result.returned })
  return answer(result)
}

export function registerListReviewQueue(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'list_review_queue',
    { title: 'Waiting in Review', description: DESCRIPTION, inputSchema: ListReviewQueueInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => listReviewQueue(caller, input),
  )
}
