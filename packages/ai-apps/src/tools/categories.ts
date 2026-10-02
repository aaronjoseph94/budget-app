/**
 * Tool 1, `list_categories` (PLAN §2.4): the owner's categories on each
 * list, with weekly budgets, as stored. No figure is worked out here; a
 * budget is a number the owner typed, given with the app's own words.
 */
import type { McpServer } from '@modelcontextprotocol/server'
import { CategoryKindSchema, ListCategoriesInputSchema } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money, type Money } from '../money.js'
import { READ_ONLY, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller } from '../rpc.js'
import { UnreadableRows, categoriesFrom } from '../rows.js'
import { utcToday } from '../windows.js'

/** The most categories one answer carries (PLAN §2.7). */
export const CATEGORY_LIMIT = 200

export const DESCRIPTION =
  'Your categories on each list, with weekly budgets. Use these exact names in other tools. ' +
  'Returns as_of (the owner’s date), lists[{list, categories[{name, weekly_budget: {cents, display} or null}]}], ' +
  'and truncated when there were more than 200.'

export async function listCategories(caller: Caller | null) {
  if (caller === null) return refusal('server_error')
  const today = utcToday()
  const read = await rpc(caller, 'ai_app_read', { p_parts: ['categories'], p_from: today, p_to: today })
  if (isRefusal(read)) {
    log('tool_list_categories_refused')
    return refusal(read.refused)
  }
  let rows
  try {
    rows = categoriesFrom(read['categories'])
  } catch (error) {
    if (!(error instanceof UnreadableRows)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  const shown = rows.slice(0, CATEGORY_LIMIT)
  const lists = CategoryKindSchema.options.flatMap((list) => {
    const categories = shown
      .filter((c) => c.kind === list)
      .map((c): { name: string; weekly_budget: Money | null } => ({
        name: cleanName(c.name),
        weekly_budget: c.weekly_budget_cents === null ? null : money(c.weekly_budget_cents),
      }))
    return categories.length === 0 ? [] : [{ list, categories }]
  })
  log('tool_list_categories_ok', { rows: shown.length })
  return answer({ as_of: read['today'], lists, truncated: rows.length > CATEGORY_LIMIT })
}

export function registerListCategories(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'list_categories',
    { title: 'List categories', description: DESCRIPTION, inputSchema: ListCategoriesInputSchema, annotations: READ_ONLY, _meta: SIGNED_IN },
    () => listCategories(caller),
  )
}
