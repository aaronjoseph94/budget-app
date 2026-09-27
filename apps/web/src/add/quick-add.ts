/**
 * Just type it, the app's side (plan A22, §3.9; F47; ADR 0005 §7).
 *
 * statement-parsers reads the line first, with no network. Only when it
 * leaves the amount, the day, the shop or the category empty is the AI
 * helper's `quick_add` task asked, about those fields alone; its answer
 * is parsed at the model-responses boundary (parseQuickAddReply), which
 * keeps an amount only when it is one of the owner's own words. What comes
 * back only fills the typed form: nothing here writes anything.
 *
 * With AI off, not set up, resting or not installed, the parser's fields
 * are still filled, and the screen says in one line why the rest was not.
 */
import { parseQuickEntry } from '@budget/statement-parsers'
import { maskLabel } from '@budget/savings-coach'
import { parseQuickAddReply, QUICK_ADD_LIMITS, type QuickAddBrief, type QuickAddField } from '@budget/schema'
import { isoDate } from '@budget/core'
import { parseMoneyInput } from '../app-data.js'
import { askAi, ranOf, type AiView } from '../ai/client.js'
import { formatForInput } from '../format.js'
import type { Category } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

/** The typed form's fields as text, and which of them the AI filled. */
export interface QuickFill {
  readonly amount: string
  readonly date: string
  readonly flow: 'spent' | 'received'
  readonly shop: string
  readonly categoryId: string
  readonly byAi: ReadonlySet<QuickAddField>
}

/** Why the AI filled nothing: not asked because nothing was empty, or the state it came to. */
export type QuickHelp = { readonly kind: 'not_needed' } | { readonly kind: 'asked'; readonly filled: number } | { readonly kind: 'stopped'; readonly view: AiView } | { readonly kind: 'unreadable' }

export interface QuickRead {
  readonly fill: QuickFill
  readonly help: QuickHelp
}

export interface QuickInput {
  readonly text: string
  readonly asOf: string
  readonly rules: ReadonlyMap<string, string>
  readonly categories: readonly Category[]
}

/** Read the line, then ask the AI only about what is still empty. */
export async function readQuickEntry(supabase: SupabaseClient, input: QuickInput): Promise<QuickRead> {
  const text = input.text.trim().slice(0, QUICK_ADD_LIMITS.text)
  const parsed = parseQuickEntry({ text, asOf: isoDate(input.asOf), rules: input.rules })
  const fill: QuickFill = {
    amount: parsed.amount === null ? '' : formatForInput(parsed.amount),
    date: parsed.date ?? '',
    flow: parsed.flow,
    shop: parsed.shop ?? '',
    categoryId: parsed.categoryId ?? '',
    byAi: new Set(),
  }
  const empty: QuickAddField[] = [
    ...(parsed.amount === null ? (['amount'] as const) : []),
    ...(parsed.date === null ? (['date'] as const) : []),
    ...(parsed.shop === null ? (['shop'] as const) : []),
    ...(parsed.categoryId === null ? (['category'] as const) : []),
  ]
  if (empty.length === 0) return { fill, help: { kind: 'not_needed' } }

  // Not spending is never offered, as on Review: a guess must not file a row out of the budget.
  const offered = input.categories.filter((c) => c.kind !== 'transfer').slice(0, QUICK_ADD_LIMITS.categories)
  const aliases = new Map(offered.map((c, n) => [`c${n + 1}`, c.id]))
  const brief: QuickAddBrief = {
    text,
    today: input.asOf,
    // Which way is asked about only when the line did not say, and only alongside something empty.
    missing: parsed.flowSaid ? empty : [...empty, 'flow'],
    categories: offered.map((c, n) => ({ alias: `c${n + 1}`, name: maskLabel(c.name), list: c.kind as Exclude<Category['kind'], 'transfer'> })),
  }
  const answer = await askAi(supabase, { action: 'run', task: 'quick_add', data: brief })
  if (!answer.ok) return { fill, help: { kind: 'stopped', view: answer.view } }
  const ran = ranOf(answer.data)
  const reply = ran === null ? null : parseQuickAddReply(ran.text, brief)
  if (reply === null || !reply.ok) return { fill, help: { kind: 'unreadable' } }

  const { pick } = reply
  const byAi = new Set<QuickAddField>()
  const amount = pick.amount === null ? null : parseMoneyInput(pick.amount)
  const category = pick.alias === null ? undefined : aliases.get(pick.alias)
  if (amount !== null && amount > 0) byAi.add('amount')
  if (pick.date !== null) byAi.add('date')
  if (pick.shop !== null) byAi.add('shop')
  if (category !== undefined) byAi.add('category')
  if (pick.flow !== null) byAi.add('flow')
  return {
    fill: {
      amount: byAi.has('amount') && amount !== null ? formatForInput(amount) : fill.amount,
      date: pick.date ?? fill.date,
      flow: pick.flow ?? fill.flow,
      // The AI's amount came from the line, so it is not part of what it was.
      shop: pick.shop ?? (byAi.has('amount') && pick.amount !== null ? without(fill.shop, pick.amount) : fill.shop),
      categoryId: category ?? fill.categoryId,
      byAi,
    },
    help: { kind: 'asked', filled: byAi.size },
  }
}

/** The shop's words less the first that is the amount, as the owner wrote it. */
function without(shop: string, amount: string): string {
  const words = shop.split(' ')
  const at = words.findIndex((w) => w.replace(/[\s\p{Sc}]/gu, '') === amount)
  return at === -1 ? shop : words.filter((_, n) => n !== at).join(' ')
}
