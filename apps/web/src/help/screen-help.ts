import type { Screen } from '../nav.js'
import type { SettingsTab } from '../settings/tab.js'
import type { HelpTopic } from './topics.js'

/** The article Settings' ? opens, by the tab showing (ADR 0014 §2). */
export const SETTINGS_TAB_HELP: Readonly<Record<SettingsTab, HelpTopic>> = { lists: 'lists', budgets: 'budgets', ai: 'free-ai', account: 'ai-apps' }

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
  // More is where a phone finds the rest.
  more: 'getting-around',
  // Settings' ? opens the tab showing (SETTINGS_TAB_HELP); this is its first tab's.
  settings: 'lists',
  // All transactions is where a charge counted twice is found and removed.
  ledger: 'wrong-number',
  savings: 'savings',
  debts: 'debts',
  coach: 'coach',
  forecast: 'forecast',
  reports: 'reports',
  ask: 'ask',
  start: 'start',
  // AI settings' own ?, drawn inside Settings' AI tab for now (nav.ts on `ai`).
  ai: 'free-ai',
}
