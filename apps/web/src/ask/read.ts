/**
 * Ask, the app's side of reading a question (plan §2.7, §3.6, A24; ADR 0005 §7).
 *
 * The AI helper's `ask` task is sent the question, today's date, the
 * owner's categories under aliases and the Help topics' titles, and nothing
 * else: no figure and no row. Its reading is parsed at the model-responses
 * boundary (parseAskPlan), which keeps only what was offered and an amount
 * only as the owner wrote it. When the AI cannot be asked (off, not set up,
 * resting, not installed, offline) or its reading does not parse, the app
 * reads the question itself (matchQuestion) and says why in one line. A
 * suggested question is always read by the app, with no call spent.
 *
 * Nothing here works out a figure: the reading goes to core's answerQuery.
 */
import { ASK_LIMITS, parseAskPlan, type AskBrief, type AskTopic } from '@budget/schema'
import { maskLabel, matchQuestion, readOf, type AskRead } from '@budget/savings-coach'
import { askAi, ranOf, type AiView } from '../ai/client.js'
import type { Category } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

/** Who read the question: the AI, or the app, with why the AI did not. */
export type ReadBy = { readonly by: 'ai' } | { readonly by: 'app'; readonly why: AiView | 'chip' | 'unreadable' }

export interface QuestionRead {
  readonly read: AskRead
  readonly by: ReadBy
}

export interface ReadQuestionInput {
  readonly question: string
  readonly asOf: string
  readonly categories: readonly Category[]
  readonly topics: readonly AskTopic[]
  /** A suggested question: read by the app, since it was written to be. */
  readonly chip: boolean
}

/** Read one question: by the AI when it can be asked, else by the app. */
export async function readQuestion(supabase: SupabaseClient, input: ReadQuestionInput): Promise<QuestionRead> {
  const question = input.question.trim().slice(0, ASK_LIMITS.question)
  // Not spending is never offered, as on Review and Just type it: it has no figure to ask about.
  const offered = input.categories.filter((c) => c.kind !== 'transfer').slice(0, ASK_LIMITS.categories)
  const topics = input.topics.slice(0, ASK_LIMITS.topics)
  const byApp = (why: Extract<ReadBy, { by: 'app' }>['why']): QuestionRead => ({
    read: matchQuestion({ question, today: input.asOf, categories: offered, topics }),
    by: { by: 'app', why },
  })
  if (input.chip) return byApp('chip')

  const aliases = new Map(offered.map((c, n) => [`c${n + 1}`, c.id]))
  const brief: AskBrief = {
    question,
    today: input.asOf,
    categories: offered.map((c, n) => ({ alias: `c${n + 1}`, name: maskLabel(c.name), list: c.kind as Exclude<Category['kind'], 'transfer'> })),
    topics,
  }
  const answer = await askAi(supabase, { action: 'run', task: 'ask', data: brief })
  if (!answer.ok) return byApp(answer.view)
  const ran = ranOf(answer.data)
  const plan = ran === null ? null : parseAskPlan(ran.text, brief)
  if (plan === null || !plan.ok) return byApp('unreadable')
  return { read: readOf(plan.plan, aliases), by: { by: 'ai' } }
}
