/**
 * `propose_change` (ADR 0013, PROPOSALS.md §3): one to twenty suggested
 * changes, each with the AI app's reason, which wait in the app's Review
 * under Suggested changes until the owner applies or dismisses each. No
 * tool applies anything, and an AI app's token cannot (0039's
 * decide_suggestion refuses it). One read to match names and work out the
 * two befores only the engine can say (proposals.ts), then one
 * ai_app_propose, counted as one suggestion call. Each change stands
 * alone: one refused leaves the others.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { ProposeChangeInputSchema, type Change } from '@budget/schema'
import { log } from '../log.js'
import { cleanName, money } from '../money.js'
import { CHANGE_SENTENCES, PARTS, isChangeCode, ownerOf, prepare, type ChangeCode, type Owner } from '../proposals.js'
import { ADDS, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller, type RefusalCode } from '../rpc.js'
import { monthsAround, utcToday } from '../windows.js'

export type ProposeChangeInput = z.output<typeof ProposeChangeInputSchema>

export const DESCRIPTION =
  'Suggest changes to the owner’s budget. Nothing changes until the owner taps Apply in the app’s Review, under ' +
  'Suggested changes; you cannot apply. Read first (get_period, get_spending, get_forecast, get_savings_goals, ' +
  'get_debts, list_review_queue, list_categories, list_suggestions), check a pattern with search_transactions, then ' +
  'suggest few changes, each with a short reason that quotes the app’s figures as given. Kinds: set_budget ' +
  '(category, month like 2026-11 or this month, applies onward or only, amount or null for none), set_weekly_limit ' +
  '(category, amount or null), set_bill (a category on Bills, Debts or Subscriptions, from_month, amount and/or ' +
  'due_day), set_goal (goal, target and/or target_date), rename_category (category, new_name), add_category (name, ' +
  'list), move_category (category, to_list), recategorise (a charge\'s id from search_transactions, category), ' +
  'learn_shop (the same, and the shop\'s later statement lines are filed there with no review). Amounts are dollars ' +
  'as text like \'450\'; names exactly as list_categories and get_savings_goals give them. No deletes, debts, pay ' +
  'or starting balances. Never say a change was made. Returns as_of, results[{index, status (suggested, ' +
  'already_suggested or refused), id, refused, sentence, change{kind, category, goal, transaction, month, from, ' +
  'to}}], waiting_suggestions and message; money is {cents, display}.'

const MESSAGE =
  'Each suggested change waits in the budget app’s Review, under Suggested changes, until the owner applies or ' +
  'dismisses it. Nothing has changed yet; say so, and never that a change was made.'

/** What names a change's subject, echoed back as the AI app sent it. */
const SUBJECT = ['category', 'goal', 'transaction', 'name', 'list', 'to_list', 'month', 'from_month', 'applies'] as const

/** A stored before or after in the words the AI app reads: money as {cents, display}, categories by name. */
const KEYS: Readonly<Record<string, string>> = { cents: 'amount', target_cents: 'target', category_id: 'category', rule_category_id: 'always_filed_under' }

function shown(part: unknown, owner: Owner): Record<string, unknown> {
  if (typeof part !== 'object' || part === null) throw new RangeError('a stored value was not an object')
  const names = new Map(owner.categories.map((c) => [c.id, cleanName(c.name)]))
  return Object.fromEntries(
    Object.entries(part).flatMap(([key, value]): [string, unknown][] => {
      if (key === 'exists') return []
      const out = KEYS[key] ?? key
      if (value === null) return [[out, null]]
      if (key.endsWith('cents')) {
        if (!Number.isSafeInteger(value)) throw new RangeError('a stored amount was not whole cents')
        return [[out, money(Number(value))]]
      }
      if (key.endsWith('category_id')) return [[out, names.get(String(value)) ?? 'a category made since']]
      return [[out, key === 'name' ? cleanName(String(value)) : value]]
    }),
  )
}

const subjectOf = (change: Change) =>
  Object.fromEntries(SUBJECT.flatMap((key) => (key in change ? [[key, (change as Record<string, unknown>)[key]]] : [])))

function refused(code: RefusalCode): CallToolResult {
  log('tool_propose_change_refused')
  return refusal(code)
}

type Stored = { index?: unknown; status?: unknown; id?: unknown; refused?: unknown; before?: unknown; after?: unknown }

export async function proposeChange(caller: Caller | null, input: ProposeChangeInput): Promise<CallToolResult> {
  if (caller === null) return refusal('server_error')
  // Budgets and monthly amounts typed up to the twelfth month on, which the owner's today may be a day past.
  const window = monthsAround(utcToday(), 0, 13)
  const read = await rpc(caller, 'ai_app_read', { p_parts: PARTS, p_from: window.from, p_to: window.to })
  if (isRefusal(read)) return refused(read.refused)
  let owner: Owner
  try {
    owner = ownerOf(read)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return refusal('records_unreadable')
  }
  const prepared = input.changes.map((change) => prepare(owner, change))
  const items = prepared.flatMap((p, index) => ('item' in p ? [{ index, item: p.item }] : []))
  const stored = new Map<number, Stored>()
  let waiting: number | null = null
  if (items.length > 0) {
    const done = await rpc(caller, 'ai_app_propose', { p_items: items.map((i) => i.item) })
    if (isRefusal(done)) return refused(done.refused)
    const results = done['results']
    waiting = Number(done['waiting'])
    if (!Array.isArray(results) || results.length !== items.length || !Number.isSafeInteger(waiting)) {
      log('rpc_shape')
      return refused('server_error')
    }
    for (const [at, r] of (results as readonly Stored[]).entries()) stored.set(items[at]!.index, r)
  }

  const refusedOne = (index: number, code: ChangeCode) => ({ index, status: 'refused', refused: code, sentence: CHANGE_SENTENCES[code] })
  let out
  try {
    out = input.changes.map((change, index) => {
      const p = prepared[index]!
      if ('refused' in p) return refusedOne(index, p.refused)
      const r = stored.get(index)
      if (r?.status === 'refused') return refusedOne(index, isChangeCode(r.refused) ? r.refused : 'server_error')
      if ((r?.status !== 'suggested' && r?.status !== 'already_suggested') || typeof r.id !== 'string') throw new RangeError('a result was not one')
      return { index, status: r.status, id: r.id, change: { kind: change.kind, ...subjectOf(change), from: shown(r.before, owner), to: shown(r.after, owner) } }
    })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('rpc_shape')
    return refused('server_error')
  }
  const count = out.filter((r) => r.status === 'refused').length
  log('tool_propose_change_ok', { suggested: out.length - count, refused: count })
  return answer({ as_of: owner.today, results: out, waiting_suggestions: waiting, message: MESSAGE })
}

export function registerProposeChange(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'propose_change',
    { title: 'Suggest changes', description: DESCRIPTION, inputSchema: ProposeChangeInputSchema, annotations: ADDS, _meta: SIGNED_IN },
    (input) => proposeChange(caller, input),
  )
}
