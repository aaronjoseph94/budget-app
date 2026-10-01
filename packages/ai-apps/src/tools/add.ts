/**
 * Tool 9, `add_expense` (PLAN §2.4, §2.5 "The one write"): one purchase,
 * or money received, added to Review and nowhere else, where it waits for
 * the owner's approval; nothing here or in ai_app_add_candidate approves.
 *
 * The dedupe hash covers the card account, read first with the owner's
 * today. It hashes the words exactly as given, never tidied (Review shows
 * them; a rule learned from the row keys on them), with `same_again` as
 * the occurrence, so asking twice adds nothing twice. SQL checks the hash.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { addDays, isoDate, type Cents, type IsoDate } from '@budget/money-primitives'
import { AddExpenseInputSchema } from '@budget/schema'
import { DEDUPE_HASH_VERSION, applySignConvention, computeDedupeHash, parseTypedAmount } from '@budget/statement-parsers'
import { log } from '../log.js'
import { cleanName, cleanShop, money } from '../money.js'
import { categoriesFrom } from '../rows.js'
import { ADDS, SIGNED_IN, answer, isRefusal, refusal, rpc, type Caller, type Refusal, type RefusalCode } from '../rpc.js'
import { utcToday } from '../windows.js'

export type AddExpenseInput = z.output<typeof AddExpenseInputSchema>
type AddTool = 'add_expense' | 'add_note'

export const DESCRIPTION =
  'Add one purchase, or money received, to the owner’s Review list; the owner checks and approves it in the app, ' +
  'and you cannot. `amount` is dollars as text like \'12.50\', positive, with `flow`. Use the owner’s own words for ' +
  '`what`. For an identical second purchase the same day, set `same_again` to 2, 3…; repeating a call adds nothing ' +
  'twice. Card purchases usually arrive with the statement; add them only if asked. `date` is the owner’s today ' +
  'unless given, and must be in their past year; `category` is a name as list_categories gives it, never Not ' +
  'spending. Returns as_of, status (added, already_waiting or already_recorded), entry{date, what, amount, flow, ' +
  'suggested_category}, waiting_in_review and message; amount is {cents, display}, money out below zero.'

/** The most an add may be, either way: $100,000.00, as 0020 holds it. */
const MOST_CENTS = 10_000_000
export const amountAllowed = (amount: Cents | null): amount is Cents => amount !== null && amount > 0 && amount <= MOST_CENTS

/** What an add reads first: the owner's today, card account, and the category named, as stored. */
export type Owner = { readonly today: IsoDate; readonly account: string; readonly category: string | null }

export async function ownerFor(caller: Caller, category: string | undefined): Promise<Owner | Refusal> {
  const day = utcToday()
  const read = await rpc(caller, 'ai_app_read', { p_parts: category === undefined ? ['account'] : ['account', 'categories'], p_from: day, p_to: day })
  if (isRefusal(read)) return read
  try {
    const today = isoDate(String(read['today']))
    const account = read['account']
    if (account === null || account === undefined) return { refused: 'no_account' }
    if (typeof account !== 'string') throw new RangeError('the account was not an id')
    if (category === undefined) return { today, account, category: null }
    // Matched as list_categories hands names out; SQL refuses Not spending too.
    const found = categoriesFrom(read['categories']).find((c) => c.kind !== 'transfer' && cleanName(c.name) === category)
    return found === undefined ? { refused: 'unknown_category' } : { today, account, category: found.name }
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    log('records_unreadable')
    return { refused: 'records_unreadable' }
  }
}

/** One entry for Review: the amount without its sign, the owner's own words. */
export type Entry = { readonly amount: Cents; readonly what: string; readonly date: IsoDate; readonly flow: 'spent' | 'received'; readonly sameAgain: number }

/** D3: money out is below $0. */
export const signedAmount = (amount: Cents, flow: 'spent' | 'received'): Cents =>
  flow === 'spent' ? applySignConvention(amount, { kind: 'debit_positive' }) : amount

const MESSAGES = {
  added: 'Added to Review. It counts nowhere until the owner approves it in the app.',
  already_waiting:
    'Nothing was added: the same entry is already waiting in Review. For a second identical purchase the same day, set same_again to 2, 3 and so on.',
  already_recorded: 'Nothing was added: the same entry is already in the owner’s approved records.',
} as const
const isStatus = (status: unknown): status is keyof typeof MESSAGES => typeof status === 'string' && Object.hasOwn(MESSAGES, status)

function refused(tool: AddTool, code: RefusalCode): CallToolResult {
  log(`tool_${tool}_refused`)
  return refusal(code)
}

/** The one write: ai_app_add_candidate, for one pending row. */
export async function addEntry(caller: Caller, owner: Owner, entry: Entry, tool: AddTool): Promise<CallToolResult> {
  if (!amountAllowed(entry.amount)) return refused(tool, 'bad_amount')
  if (entry.date > owner.today || entry.date < addDays(owner.today, -366)) return refused(tool, 'bad_date')
  const signed = signedAmount(entry.amount, entry.flow)
  // Its own kind, never a statement row's hash (0031, mcp-2-01).
  const occurrence = { kind: 'ai_app', index: entry.sameAgain } as const
  const hash = await computeDedupeHash({ accountId: owner.account, postedOn: entry.date, amountCents: signed, merchantRaw: entry.what, discriminator: occurrence })
  const added = await rpc(caller, 'ai_app_add_candidate', {
    p_account: owner.account, p_posted_on: entry.date, p_amount_cents: signed, p_words: entry.what, p_occurrence: entry.sameAgain,
    p_dedupe_hash: hash, p_dedupe_hash_v: DEDUPE_HASH_VERSION, p_category_name: owner.category,
  })
  // A refusal the server does not know, or an answer it cannot read, may follow a write.
  if (isRefusal(added)) return refused(tool, added.refused === 'server_error' ? 'not_confirmed' : added.refused)
  const status = added['status']
  if (!isStatus(status)) {
    log('rpc_shape')
    return refused(tool, 'not_confirmed')
  }
  log(`tool_${tool}_ok`)
  const suggested = owner.category === null ? null : cleanName(owner.category)
  return answer({
    as_of: owner.today,
    status,
    entry: { date: entry.date, what: cleanShop(entry.what), amount: money(signed), flow: entry.flow, suggested_category: suggested },
    waiting_in_review: Number(added['waiting']),
    message: MESSAGES[status],
  })
}

/** The day asked for, or null for one isoDate cannot read (zod passes 0000-02-29; N147). */
function dayOf(text: string): IsoDate | null {
  try {
    return isoDate(text)
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return null
  }
}

export async function addExpense(caller: Caller | null, input: AddExpenseInput): Promise<CallToolResult> {
  if (caller === null) return refusal('server_error')
  const amount = parseTypedAmount(input.amount)
  if (!amountAllowed(amount)) return refused('add_expense', 'bad_amount')
  const asked = input.date === undefined ? undefined : dayOf(input.date)
  if (asked === null) return refused('add_expense', 'bad_date')
  const owner = await ownerFor(caller, input.category)
  if (isRefusal(owner)) return refused('add_expense', owner.refused)
  return addEntry(caller, owner, { amount, what: input.what, date: asked ?? owner.today, flow: input.flow, sameAgain: input.same_again }, 'add_expense')
}

export function registerAddExpense(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'add_expense',
    { title: 'Add to Review', description: DESCRIPTION, inputSchema: AddExpenseInputSchema, annotations: ADDS, _meta: SIGNED_IN },
    (input) => addExpense(caller, input),
  )
}
