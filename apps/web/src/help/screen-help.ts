import type { Screen } from '../nav.js'
import type { HelpTopic } from './topics.js'

/**
 * The article each screen's ? opens (plan §8.2), kept here rather than on
 * the articles so the button carries no article text into the first load.
 * Help itself has no ?.
 */
export const SCREEN_HELP: Readonly<Record<Exclude<Screen, 'help'>, HelpTopic>> = {
  month: 'periods',
  week: 'periods',
  paycheck: 'periods',
  year: 'periods',
  calendar: 'budgets',
  review: 'review',
  add: 'add',
  // More is where a phone finds the rest; Setup is its lists and categories.
  more: 'getting-around',
  setup: 'lists',
  settings: 'budgets',
  // All transactions is where a charge counted twice is found and removed.
  ledger: 'wrong-number',
  savings: 'savings',
  debts: 'debts',
  coach: 'coach',
  forecast: 'forecast',
  reports: 'reports',
  ask: 'ask',
  start: 'start',
  ai: 'free-ai',
}
