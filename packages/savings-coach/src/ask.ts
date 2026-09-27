/**
 * Ask about your money: the intents it answers, and the app's own reading
 * of a question for when the AI does not read it (plan §2.7, §3.11 row 12,
 * A24; ADR 0005 §7).
 *
 * The AI reads a question into a plan (packages/schema's AskPlan). With AI
 * off, not set up, resting or not installed, `matchQuestion` reads it
 * instead, by plain words: good enough for the suggested questions, each of
 * which it is tested to read, and for most short ones. Either way the
 * reading becomes core's AskQuery (`queryOf`) and core works out every
 * figure; nothing here counts money.
 */
import type { AskIntentName, AskMonthName, AskPeriodName, AskPeriodPick, AskPlan, AskTopic } from '@budget/schema'
import type { AskPeriod, AskQuery } from '@budget/core'

/** Where the whole of an answer is shown. */
export type AskScreen = 'month' | 'week' | 'reports' | 'forecast' | 'savings' | 'debts' | 'help'

export interface IntentEntry {
  /** What was asked, as "I read that as" names it. */
  readonly label: string
  /** Where the whole of it is: a report for the months, the Forecast, Savings, Debts. */
  readonly screen: AskScreen
  /** A question to suggest, which matchQuestion reads as this intent. */
  readonly example: string
}

/** The intent catalogue: every kind of question Ask answers, in the order suggestions are offered. */
export const ASK_CATALOGUE: Readonly<Record<AskIntentName, IntentEntry>> = {
  spend_in: { label: 'How much you spent', screen: 'month', example: 'How much did I spend this month?' },
  compare: { label: 'Against the time before', screen: 'month', example: 'Am I spending more than last month?' },
  top_categories: { label: 'Where your money went', screen: 'reports', example: 'Where did my money go last month?' },
  top_shops: { label: 'Your top shops', screen: 'reports', example: 'Which shops did I spend most at this month?' },
  subscriptions: { label: 'Your subscriptions', screen: 'reports', example: 'What are my subscriptions?' },
  forecast: { label: 'Where the month ends', screen: 'forecast', example: 'Where will this month end?' },
  safe_to_spend: { label: 'Safe to spend', screen: 'forecast', example: 'How much is safe to spend today?' },
  goal_date: { label: 'When you reach your goals', screen: 'savings', example: 'When will I reach my goal?' },
  what_if_cut: { label: 'What a saving would do', screen: 'forecast', example: 'What if I saved $50 a month?' },
  debt_free: { label: 'Your debt-free date', screen: 'debts', example: 'When will I be debt-free?' },
  explain_month: { label: 'Your month explained', screen: 'month', example: 'How did last month go?' },
  budget_left: { label: 'What is left of your budget', screen: 'week', example: 'How much do I have left this week?' },
  help: { label: 'Help', screen: 'help', example: 'How do I bring in a statement?' },
}

/** A question as the app will answer it: an intent with category ids, a Help topic, or nothing to go on. */
export type AskRead =
  | {
      readonly kind: 'intent'
      readonly intent: Exclude<AskIntentName, 'help'>
      readonly categoryIds: readonly string[]
      readonly period: AskPeriodPick | null
      /** The owner's own word for an amount, for the app's amount parser. */
      readonly amountText: string | null
    }
  | { readonly kind: 'help'; readonly topic: string }
  | { readonly kind: 'cannot' }

/** The AI's plan with each alias turned back into the category it stood for; an alias not offered is left out. */
export function readOf(plan: AskPlan, aliases: ReadonlyMap<string, string>): AskRead {
  if (plan.kind !== 'intent') return plan
  const categoryIds = plan.aliases.flatMap((a) => {
    const id = aliases.get(a)
    return id === undefined ? [] : [id]
  })
  return { kind: 'intent', intent: plan.intent, categoryIds, period: plan.period, amountText: plan.amountText }
}

export interface MatchQuestionInput {
  readonly question: string
  /** Today, `YYYY-MM-DD`: a month named with no year is the latest one. */
  readonly today: string
  readonly categories: readonly { readonly id: string; readonly name: string }[]
  readonly topics: readonly AskTopic[]
}

/** Words that say which intent, most particular first: "what if I cut dining" is a what-if, not spending. */
const INTENT_WORDS: readonly (readonly [Exclude<AskIntentName, 'help'>, RegExp])[] = [
  ['debt_free', /\bdebts?\b|debt free/],
  ['safe_to_spend', /\bsafe\b|\bafford\b/],
  ['subscriptions', /\bsubscri|\brecurring\b|\bregular charges?\b/],
  ['what_if_cut', /\bwhat if\b|\bcut\b|\btrim\b|\bspent less\b/],
  ['goal_date', /\bgoals?\b|\bflight\b|\bfly(ing)?\b|\breach\b/],
  ['forecast', /\bforecast\b|\bend of (the |this )?month\b|\bmonth (will )?end\b|\bheading\b|\bwill .* end\b/],
  ['budget_left', /\bleft\b|\bremaining\b|\bbudget\b/],
  ['top_shops', /\bshops?\b|\bstores?\b|\bmerchants?\b/],
  ['compare', /\bcompare|\bthan\b|\bvs\b|\bversus\b/],
  ['top_categories', /\bwhere did\b|\bwhere does\b|\bbiggest\b|\bmost\b|\btop\b|\bcategories\b/],
  ['explain_month', /\bhow (did|was|is|has)\b.*\b(month|go|going)\b|\bexplain\b|\bsummary\b|\bhow am i doing\b/],
  ['spend_in', /\bspen[dt]\b|\bspending\b|\bcost\b|\bpaid\b|\bhow much\b/],
]
const HELP_WORDS = /^(how (do|can|should) i|how to|where (do|can|is)|what (is|does|are)|why)\b/

const PERIOD_WORDS: readonly (readonly [AskPeriodName, RegExp])[] = [
  ['this_week', /\bthis week\b/],
  ['last_week', /\blast week\b/],
  ['last_three_months', /\b(last|past) (three|3) months\b/],
  ['this_month', /\bthis month\b/],
  ['last_month', /\blast month\b/],
  ['this_year', /\bthis year\b/],
  ['last_year', /\blast year\b/],
]
const MONTHS: readonly AskMonthName[] = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
]
/** Short names too, but never "may" or "mar" alone in a sentence that means something else: only as the whole word. */
const MONTH_WORD = /\b(?:(last) )?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/
const AMOUNT_WORD = /^\$?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\$?$/

/** The question in lower case, NFKC, with the punctuation a sentence ends in turned to spaces. */
const plain = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’']/g, '').replace(/[?!.,;:()"]/g, ' ').replace(/\s+/g, ' ').trim()

/** The app's own reading of a question, by plain words, with no AI. */
export function matchQuestion(input: MatchQuestionInput): AskRead {
  const text = plain(input.question)
  if (text === '') return { kind: 'cannot' }
  const found = INTENT_WORDS.find(([, words]) => words.test(text))
  if (found === undefined) {
    const topic = topicOf(text, input.topics)
    return topic === null ? { kind: 'cannot' } : { kind: 'help', topic }
  }
  // "How do I set a budget?" asks for Help; "how much is left in my budget" does not.
  if (HELP_WORDS.test(text) && !/\bhow much\b|\bwhen will\b|\bwhere did\b/.test(text)) {
    const topic = topicOf(text, input.topics)
    if (topic !== null) return { kind: 'help', topic }
  }
  return { kind: 'intent', intent: found[0], categoryIds: categoriesIn(text, input.categories), period: periodIn(text, input.today), amountText: amountIn(input.question) }
}

/** A word of four or more letters, less a plural's s, as two words are compared. */
const stems = (text: string) => text.split(' ').filter((w) => w.length >= 4).map((w) => w.replace(/s$/, ''))

/** The Help topic whose title shares the most such words with the question; none on a tie or nothing shared. */
function topicOf(text: string, topics: readonly AskTopic[]): string | null {
  const words = new Set(stems(text))
  const scored = topics.map((t) => ({ id: t.id, shared: stems(plain(t.title)).filter((w) => words.has(w)).length }))
  const best = Math.max(0, ...scored.map((s) => s.shared))
  const top = scored.filter((s) => s.shared === best)
  return best === 0 || top.length !== 1 ? null : top[0]!.id
}

/** Each category whose name is in the question, as a whole phrase or without a plural's s, in the order they come; at most three. */
function categoriesIn(text: string, categories: MatchQuestionInput['categories']): string[] {
  const at = categories.flatMap((c) => {
    const name = plain(c.name)
    if (name === '') return []
    const forms = [name, name.replace(/s$/, ''), name.replace(/ies$/, 'y')].filter((f) => f.length >= 3)
    const hits = forms.map((f) => text.search(new RegExp(`(?<![\\p{L}\\p{N}])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u'))).filter((i) => i >= 0)
    return hits.length === 0 ? [] : [{ id: c.id, at: Math.min(...hits) }]
  })
  return at.sort((a, b) => a.at - b.at).slice(0, 3).map((c) => c.id)
}

function periodIn(text: string, today: string): AskPeriodPick | null {
  const named = PERIOD_WORDS.find(([, words]) => words.test(text))
  if (named !== undefined) return { kind: named[0] }
  const month = MONTH_WORD.exec(text)
  if (month === null) return null
  const index = MONTHS.findIndex((m) => m.startsWith(month[2]!.slice(0, 3)))
  const name = MONTHS[index]!
  // A month named alone is the latest one: in September, "December" is last December.
  const later = index + 1 > Number(today.slice(5, 7))
  return { kind: 'month', month: name, year: month[1] === 'last' || later ? 'last' : 'this' }
}

/** The first word that is an amount, as the owner wrote it less its dollar sign. */
function amountIn(question: string): string | null {
  const word = question
    .normalize('NFKC')
    .split(/\s+/)
    .map((w) => w.replace(/[?!,;:]+$/, '').replace(/\.$/, ''))
    .find((w) => AMOUNT_WORD.test(w))
  return word === undefined ? null : word.replace(/\$/g, '')
}

const MONTH_NUMBER: Readonly<Record<AskMonthName, number>> = Object.fromEntries(MONTHS.map((m, i) => [m, i + 1])) as Record<AskMonthName, number>

/** A reading as core's question: a month's name as its number, and the amount the app has read in cents. */
export function queryOf(read: Extract<AskRead, { kind: 'intent' }>, monthlyCents: number | null): AskQuery {
  const p = read.period
  const period: AskPeriod | null = p === null ? null : p.kind === 'month' ? { kind: 'month', month: MONTH_NUMBER[p.month], yearsBack: p.year === 'last' ? 1 : 0 } : { kind: p.kind }
  return { intent: read.intent, period, categoryIds: read.categoryIds, monthlyCents: read.intent === 'what_if_cut' ? monthlyCents : null }
}
