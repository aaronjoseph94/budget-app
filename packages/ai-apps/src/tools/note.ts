/**
 * Tool 10, `add_note` (PLAN §2.4): something the owner said in their own
 * words, read the way the app's Just type it reads a line (F47), from the
 * owner's today and with no learned rules, since a category is the AI's
 * to name. With an amount, what it was and a day, it takes add_expense's
 * path to Review; otherwise nothing is added, and `missing` says what to
 * ask. Nothing is guessed: two numbers that could each be the amount, or a
 * date with slashes, are missing, never picked.
 */
import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import { AddNoteInputSchema } from '@budget/schema'
import { parseQuickEntry } from '@budget/statement-parsers'
import { log } from '../log.js'
import { cleanShop, money } from '../money.js'
import { ADDS, SIGNED_IN, answer, isRefusal, refusal, type Caller } from '../rpc.js'
import { addEntry, ownerFor, signedAmount } from './add.js'

export type AddNoteInput = z.output<typeof AddNoteInputSchema>

export const DESCRIPTION =
  'Add something the owner said in their own words, like \'coffee 4.50 yesterday\' or \'got paid 2100\', read the ' +
  'way the app’s Just type it reads it. With an amount, what it was and a day, it goes to Review as add_expense ' +
  'would; otherwise nothing is added and `missing` says what to ask. Two numbers that could each be the amount, ' +
  'or a date with slashes, are never guessed. Returns add_expense’s result, or as_of, status needs_more, ' +
  'missing[amount | what | date], read_so_far{date, what, amount, flow} and message.'

/** The most words an entry keeps, as add_expense's `what` and 0020 hold them. */
const WORDS_LIMIT = 120

const NEEDS_MORE =
  'Nothing was added. Ask the owner for what is missing (what it was, in at most 120 characters; one amount; a day ' +
  'such as 2026-09-28 or yesterday), then call add_note again with the whole sentence, or add_expense.'

export async function addNote(caller: Caller | null, input: AddNoteInput): Promise<CallToolResult> {
  if (caller === null) return refusal('server_error')
  // The owner's today first: "yesterday" and a weekday count from it.
  const owner = await ownerFor(caller, input.category)
  if (isRefusal(owner)) {
    log('tool_add_note_refused')
    return refusal(owner.refused)
  }
  const read = parseQuickEntry({ text: input.text, asOf: owner.today, rules: new Map() })
  const what = read.shop !== null && read.shop.length <= WORDS_LIMIT ? read.shop : null
  if (read.amount === null || what === null || read.date === null) {
    log('tool_add_note_needs_more')
    const missing = [read.amount === null && 'amount', what === null && 'what', read.date === null && 'date'].filter((m) => m !== false)
    return answer({
      as_of: owner.today,
      status: 'needs_more',
      missing,
      read_so_far: {
        date: read.date,
        what: what === null ? null : cleanShop(what),
        amount: read.amount === null ? null : money(signedAmount(read.amount, read.flow)),
        flow: read.flow,
      },
      message: NEEDS_MORE,
    })
  }
  return addEntry(caller, owner, { amount: read.amount, what, date: read.date, flow: read.flow, sameAgain: input.same_again }, 'add_note')
}

export function registerAddNote(server: McpServer, caller: Caller | null): void {
  server.registerTool(
    'add_note',
    { title: 'Add what the owner said', description: DESCRIPTION, inputSchema: AddNoteInputSchema, annotations: ADDS, _meta: SIGNED_IN },
    (input) => addNote(caller, input),
  )
}
