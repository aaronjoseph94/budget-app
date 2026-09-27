/**
 * Ask about your money, as the AI is asked and as its reading comes back
 * (plan §2.7, §3.6, A24; ADR 0005 §7).
 *
 * The AI is sent the owner's question, today's date, the owner's categories
 * under aliases and the Help topics' titles, and nothing else: no figure,
 * no balance, no row. It answers with a plan, never with an answer: which
 * of a fixed set of intents the question is, which categories (by alias),
 * which period (from a fixed set with no digit in it), which Help topic,
 * and an amount only as the owner wrote it; or that it cannot. The app then
 * works out every figure in packages/core (`answerQuery`).
 *
 * `parseAskPlan` is the model-responses boundary: the outer shape is parsed
 * with zod, then each part alone is kept only when it is one the brief
 * offered, so a wrong or steered part drops only itself. An amount is kept
 * only when it is, word for word, one of the words of the question (the
 * rule quick_add's amount follows), and the owner can still change it.
 */
import { z } from 'zod'
import type { CategoriseCategory } from './categorise.js'
import { amountIsTyped } from './quick-add.js'

/** Every kind of question Ask answers. `help` opens a Help article; the rest are answered by core. */
export const ASK_INTENTS = [
  'spend_in',
  'compare',
  'top_categories',
  'top_shops',
  'subscriptions',
  'forecast',
  'safe_to_spend',
  'goal_date',
  'what_if_cut',
  'debt_free',
  'explain_month',
  'budget_left',
  'help',
] as const
export type AskIntentName = (typeof ASK_INTENTS)[number]

/** The periods a question can name, none with a digit, so a model cannot slip a date through one. */
export const ASK_PERIODS = ['this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'last_three_months'] as const
export type AskPeriodName = (typeof ASK_PERIODS)[number]

export const ASK_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
] as const
export type AskMonthName = (typeof ASK_MONTHS)[number]

/** What one request may carry; the helper's zod holds it to the same. */
export const ASK_LIMITS = { question: 300, categories: 200, topics: 40, title: 80, aliases: 3 } as const

/** A Help article the question may be about, by its committed id and title. */
export interface AskTopic {
  readonly id: string
  readonly title: string
}

export interface AskBrief {
  /** What the owner asked, at most 300 characters. */
  readonly question: string
  /** Today, `YYYY-MM-DD`, so "this month" and "in August" can be read. */
  readonly today: string
  /** Not spending is never offered, as on Review and Just type it. */
  readonly categories: readonly CategoriseCategory[]
  readonly topics: readonly AskTopic[]
}

export type AskPeriodPick = { readonly kind: AskPeriodName } | { readonly kind: 'month'; readonly month: AskMonthName; readonly year: 'this' | 'last' }

export type AskPlan =
  | {
      readonly kind: 'intent'
      readonly intent: Exclude<AskIntentName, 'help'>
      /** At most three, each one the brief offered, in the order given. */
      readonly aliases: readonly string[]
      readonly period: AskPeriodPick | null
      /** The owner's own word for an amount, spaces and currency signs taken out, for the app's amount parser. */
      readonly amountText: string | null
    }
  | { readonly kind: 'help'; readonly topic: string }
  | { readonly kind: 'cannot' }

/** `dropped` counts the parts refused, as a number only, never with their text. */
export type AskParsed = { readonly ok: true; readonly plan: AskPlan; readonly dropped: number } | { readonly ok: false }

const Text = z.string().max(400).nullable().optional()
const ReplyShape = z.object({
  intent: z.string().max(40),
  categories: z.array(z.string().max(40)).max(20).nullable().optional(),
  period: Text,
  month: Text,
  year: Text,
  topic: Text,
  amount: Text,
})

const given = (s: string | null | undefined): s is string => s !== null && s !== undefined && s.trim() !== ''
const isOneOf = <T extends string>(list: readonly T[], s: string): s is T => (list as readonly string[]).includes(s)

/** A model's reading of one question, held to what its brief offered. */
export function parseAskPlan(raw: unknown, brief: AskBrief): AskParsed {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ok: false }
    }
  }
  const shape = ReplyShape.safeParse(value)
  if (!shape.success) return { ok: false }
  const reply = shape.data
  const intent = reply.intent.trim()
  if (intent === 'cannot') return { ok: true, plan: { kind: 'cannot' }, dropped: 0 }
  if (!isOneOf(ASK_INTENTS, intent)) return { ok: true, plan: { kind: 'cannot' }, dropped: 1 }
  if (intent === 'help') {
    const topic = given(reply.topic) ? reply.topic.trim() : ''
    return brief.topics.some((t) => t.id === topic) ? { ok: true, plan: { kind: 'help', topic }, dropped: 0 } : { ok: true, plan: { kind: 'cannot' }, dropped: 1 }
  }

  let dropped = 0
  const offered = new Set(brief.categories.map((c) => c.alias))
  const aliases: string[] = []
  for (const alias of reply.categories ?? []) {
    if (offered.has(alias) && !aliases.includes(alias) && aliases.length < ASK_LIMITS.aliases) aliases.push(alias)
    else dropped += 1
  }
  const period = periodOf(reply)
  if (period === 'refused') dropped += 1
  let amountText: string | null = null
  if (given(reply.amount)) {
    if (amountIsTyped(reply.amount, brief.question)) amountText = reply.amount.normalize('NFKC').replace(/[\s\p{Sc}]/gu, '')
    else dropped += 1
  }
  return { ok: true, plan: { kind: 'intent', intent, aliases, period: period === 'refused' ? null : period, amountText }, dropped }
}

/** A period from the fixed set, a month by its name this year or last, none, or refused. */
function periodOf(reply: z.infer<typeof ReplyShape>): AskPeriodPick | null | 'refused' {
  if (!given(reply.period)) return null
  const period = reply.period.trim()
  if (isOneOf(ASK_PERIODS, period)) return { kind: period }
  if (period !== 'month') return 'refused'
  const month = given(reply.month) ? reply.month.trim().toLowerCase() : ''
  const year = given(reply.year) ? reply.year.trim() : 'this'
  return isOneOf(ASK_MONTHS, month) && (year === 'this' || year === 'last') ? { kind: 'month', month, year } : 'refused'
}
