/**
 * Which questions Ask suggests (plan §2.7): every intent's example from the
 * catalogue, or, when Ask was opened from a screen's help sheet ("Ask about
 * this"), the ones about that screen first. Each is a question the app reads
 * by itself, so a suggestion works with AI off.
 */
import type { AskIntentName } from '@budget/schema'
import { ASK_CATALOGUE } from '@budget/savings-coach'
import type { HelpTopic } from '../help/topics.js'

/** The questions each Help topic is most about; a topic not here suggests the general few. */
const ABOUT: Partial<Record<HelpTopic, readonly AskIntentName[]>> = {
  'getting-around': ['spend_in', 'compare', 'budget_left', 'explain_month'],
  budgets: ['budget_left', 'subscriptions', 'top_categories'],
  savings: ['goal_date', 'what_if_cut'],
  debts: ['debt_free'],
  coach: ['explain_month', 'goal_date', 'what_if_cut'],
  checkin: ['budget_left', 'compare'],
  forecast: ['forecast', 'safe_to_spend', 'what_if_cut'],
  'month-end': ['forecast', 'explain_month'],
  reports: ['top_categories', 'top_shops', 'subscriptions', 'compare'],
  comparisons: ['compare', 'explain_month'],
  review: ['help', 'top_shops'],
  add: ['help', 'spend_in'],
}
const GENERAL: readonly AskIntentName[] = ['spend_in', 'safe_to_spend', 'goal_date', 'top_categories', 'compare', 'subscriptions']
const ALL = Object.keys(ASK_CATALOGUE) as AskIntentName[]

/** Four questions to offer: the topic's first, then the general ones. */
export function suggestions(topic: HelpTopic | null): readonly string[] {
  const first = topic === null ? [] : (ABOUT[topic] ?? [])
  return [...new Set([...first, ...GENERAL, ...ALL])].slice(0, 4).map((i) => ASK_CATALOGUE[i].example)
}
