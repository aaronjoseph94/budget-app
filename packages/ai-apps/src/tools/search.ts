/**
 * Tool 7, `search_transactions` (PLAN §2.4): approved charges found by
 * words in the shop's name, categories, list, dates, amount and flow. The
 * database matches and counts the rows (ai_app_search); the totals over
 * every match are core's entriesTotals (F52), never an addition here or
 * by the AI app over the rows it was given. Review's rows are not searched.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { entriesTotals, isoDate, type CategoryKind } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { SearchTransactionsInputSchema } from '@budget/schema'
import { parseTypedAmount } from '@budget/statement-parsers'
import { log } from '../log.js'
import { cleanName, cleanShop, flowOf, money } from '../money.js'
import { categoriesFrom, type CategoryRow } from '../rows.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller, type Refusal } from '../rpc.js'
import { searchWindow, utcToday } from '../windows.js'

export type SearchTransactionsInput = z.output<typeof SearchTransactionsInputSchema>

export const DESCRIPTION =
  'Find approved charges (not Review) by words in the shop name, categories, list, dates, amount range, or money ' +
  'in or out. `categories` are names as list_categories gives them; one the owner does not have is refused. `from` and `to` default to the last 90 days, and may span at most three years; amounts are dollars ' +
  'as text like \'25\', compared without their sign. Newest first, at most `limit`; total_matches and totals cover ' +
  'every match, not only those returned: totals{spent, received, count, not_spending_left_out}, gross (a refund is ' +
  'money received, never taken off spent). Not-spending rows (like card payments) are listed but left out of the ' +
  'totals. totals is null past 5,000 matches: narrow the search. Every amount is {cents, display}, money out ' +
  'below zero; quote display. Returns as_of, window, total_matches, totals, returned, truncated, ' +
  'rows[{date, shop, flow, amount, category, list, source}].'

/**
 * The stored names of the categories asked for, each matched as
 * list_categories hands names out (cleaned), so one typed with a hidden
 * character is still found. A name the owner does not have is refused, as
 * every tool refuses it, rather than matching nothing and totalling $0.00.
 * One more counted read, made only when categories are named.
 */
async function storedNames(caller: Caller, wanted: readonly string[], day: IsoDate): Promise<string[] | Refusal> {
  const read = await rpc(caller, 'ai_app_read', { p_parts: ['categories'], p_from: day, p_to: day })
  if (isRefusal(read)) return read
  let stored: CategoryRow[]
  try {
    stored = categoriesFrom(read['categories'])
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return { refused: 'records_unreadable' }
  }
  const named = stored.filter((c) => wanted.includes(cleanName(c.name)))
  return wanted.every((n) => named.some((c) => cleanName(c.name) === n)) ? named.map((c) => c.name) : { refused: 'unknown_category' }
}

type Match = { posted_on: string; amount_cents: number; merchant_raw: string; category: string; kind: CategoryKind; source: string }

export async function searchTransactions(caller: Caller | null, input: SearchTransactionsInput) {
  if (caller === null) return refusal('server_error')
  const window = searchWindow(input.from === undefined ? undefined : isoDate(input.from), input.to === undefined ? undefined : isoDate(input.to), utcToday())
  const min = input.min_amount === undefined ? null : parseTypedAmount(input.min_amount)
  const max = input.max_amount === undefined ? null : parseTypedAmount(input.max_amount)
  if (window === null || (min !== null && max !== null && min > max)) return refusal('bad_search')
  const names = input.categories === undefined ? null : await storedNames(caller, input.categories, window.to)
  if (names !== null && isRefusal(names)) {
    log('tool_search_transactions_refused')
    return refusal(names.refused)
  }
  const found = await rpc(caller, 'ai_app_search', {
    p_text: input.text ?? null,
    p_from: window.from,
    p_to: window.to,
    p_min: min,
    p_max: max,
    p_categories: names,
    p_list: input.list ?? null,
    p_flow: input.flow,
    p_limit: input.limit,
  })
  if (isRefusal(found)) {
    log('tool_search_transactions_refused')
    return refusal(found.refused)
  }
  let result
  try {
    if (!Array.isArray(found['rows']) || (found['all'] !== null && !Array.isArray(found['all']))) throw new RangeError('a search part was not a list')
    const rows = found['rows'] as readonly Match[]
    const all = found['all'] as readonly { amount_cents: number; kind: CategoryKind }[] | null
    const totals = all === null ? null : entriesTotals({ entries: all.map((m) => ({ amountCents: Number(m.amount_cents), kind: m.kind })) })
    const total = Number(found['total'])
    result = {
      as_of: isoDate(String(found['today'])),
      window,
      total_matches: total,
      totals:
        totals === null
          ? null
          : { spent: money(totals.spentCents), received: money(totals.receivedCents), count: totals.count, not_spending_left_out: totals.notSpendingCount },
      returned: rows.length,
      truncated: total > rows.length,
      rows: rows.map((r) => ({
        date: isoDate(r.posted_on),
        shop: cleanShop(r.merchant_raw),
        flow: flowOf(Number(r.amount_cents)),
        amount: money(Number(r.amount_cents)),
        category: cleanName(r.category),
        list: r.kind,
        source: r.source,
      })),
    }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_search_transactions_ok', { rows: result.returned })
  return answer(result)
}

export function registerSearchTransactions(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'search_transactions',
    { title: 'Search transactions', description: DESCRIPTION, inputSchema: SearchTransactionsInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => searchTransactions(caller, input),
  )
}
