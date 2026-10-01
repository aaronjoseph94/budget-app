/**
 * Every Help article's id, in the order Help lists them (plan §8.2).
 *
 * Committed here, apart from the articles themselves, so the address parser
 * can refuse a topic that does not exist without loading any article text
 * into the first load. An id is lowercase words and hyphens with no digit,
 * as ADR 0005 asks of anything the AI may name.
 */
export const HELP_TOPICS = [
  'start',
  'updates',
  'periods',
  'statements',
  'review',
  'add',
  'budgets',
  'savings',
  'goals',
  'debts',
  'coach',
  'checkin',
  'forecast',
  'month-end',
  'reports',
  'comparisons',
  'ask',
  'free-ai',
  'more-ai',
  'ai-sees',
  'ai-rests',
  'ai-apps',
  'connect-claude',
  'connect-chatgpt',
  'wrong-number',
  'codes',
  'iphone',
  'words',
] as const

export type HelpTopic = (typeof HELP_TOPICS)[number]
