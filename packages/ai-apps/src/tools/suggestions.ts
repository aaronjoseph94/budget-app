/**
 * `list_suggestions` (ADR 0013, PROPOSALS.md §3): the changes AI apps
 * suggested, newest first, and what became of each: waiting, applied or
 * dismissed by the owner, replaced by a later one, or expired after 14
 * days. One counted read, ai_app_suggestions (0039), which also hands
 * back the current names of what each names. A stored row is an AI app's
 * output at rest, so it is parsed as one (StoredSuggestionSchema); one
 * that does not parse is listed as unreadable.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { isoDate } from '@budget/core'
import { ListSuggestionsInputSchema, StoredSuggestionSchema, type StoredSuggestion } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, cleanShop, money } from '../money.js'
import { shownValue } from '../proposals.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'

export type ListSuggestionsInput = z.output<typeof ListSuggestionsInputSchema>

export const DESCRIPTION =
  'The changes AI apps suggested to the owner, newest first, and what became of each: pending (waiting in the ' +
  'app\'s Review for the owner), applied, dismissed, replaced by a later suggestion, or expired after 14 days. ' +
  'Call it before suggesting, so you neither repeat a waiting change nor ask again for one the owner dismissed. ' +
  'Names are as they are now. Returns as_of, waiting, returned, rows[{id, kind, status, suggested_at, decided_at, ' +
  'expires_at, change{category, goal, transaction, month, applies, name, list, from, to}, reason}]; money is ' +
  '{cents, display}.'

const GONE = 'a removed category'

type Named = { id: string; name: string }
type Charge = { id: string; posted_on: string; amount_cents: number; merchant_raw: string }

function listOf<T>(part: unknown): readonly T[] {
  if (!Array.isArray(part)) throw new RangeError('a part of the answer was not a list')
  return part as readonly T[]
}

/** What a suggestion is about, by the names things have now. */
function about(row: StoredSuggestion, categories: ReadonlyMap<string, string>, goals: ReadonlyMap<string, string>, charges: ReadonlyMap<string, unknown>) {
  const t = row.target as Readonly<Record<string, unknown>>
  const category = typeof t['category_id'] === 'string' ? { category: categories.get(t['category_id']) ?? GONE } : {}
  const goal = typeof t['goal_id'] === 'string' ? { goal: goals.get(t['goal_id']) ?? 'a removed goal' } : {}
  const charge = typeof t['transaction_id'] === 'string' ? { transaction: charges.get(t['transaction_id']) ?? 'a removed charge' } : {}
  const month = typeof t['month'] === 'string' ? { month: t['month'].slice(0, 7) } : {}
  const applies = typeof t['applies'] === 'string' ? { applies: t['applies'] } : {}
  return { ...category, ...goal, ...charge, ...month, ...applies }
}

export async function listSuggestions(caller: Caller | null, input: ListSuggestionsInput): Promise<CallToolResult> {
  if (caller === null) return refusal('server_error')
  const got = await rpc(caller, 'ai_app_suggestions', { p_status: input.status, p_limit: input.limit })
  if (isRefusal(got)) {
    log('tool_list_suggestions_refused')
    return refusal(got.refused)
  }
  let result
  try {
    const categories = new Map(listOf<Named>(got['categories']).map((c) => [c.id, cleanName(c.name)]))
    const goals = new Map(listOf<Named>(got['goals']).map((g) => [g.id, cleanName(g.name)]))
    const charges = new Map(
      listOf<Charge>(got['transactions']).map((c) => [c.id, { date: isoDate(c.posted_on), shop: cleanShop(c.merchant_raw), amount: money(Number(c.amount_cents)) }]),
    )
    const rows = listOf<Readonly<Record<string, unknown>>>(got['rows']).map((raw) => {
      const when = { status: String(raw['status']), suggested_at: raw['created_at'], decided_at: raw['decided_at'], expires_at: raw['expires_at'] }
      const parsed = StoredSuggestionSchema.safeParse(raw)
      if (!parsed.success) return { id: typeof raw['id'] === 'string' ? raw['id'] : null, kind: null, ...when, unreadable: true }
      const row = parsed.data
      const from = row.kind === 'add_category' ? null : shownValue(row.before, categories, GONE)
      return { id: row.id, kind: row.kind, ...when, change: { ...about(row, categories, goals, charges), from, to: shownValue(row.after, categories, GONE) }, reason: row.reason }
    })
    result = { as_of: isoDate(String(got['today'])), waiting: Number(got['waiting']), returned: rows.length, rows }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  log('tool_list_suggestions_ok', { rows: result.returned })
  return answer(result)
}

export function registerListSuggestions(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'list_suggestions',
    { title: 'Suggested changes', description: DESCRIPTION, inputSchema: ListSuggestionsInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    (input) => listSuggestions(caller, input),
  )
}
