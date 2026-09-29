import type { Screen } from '../nav.js'

/** Each screen's name, as its tab or More names it. */
export const SCREEN_NAME: Record<Screen, string> = {
  month: 'Month',
  week: 'Week',
  review: 'Review',
  add: 'Add',
  more: 'More',
  ledger: 'All transactions',
  settings: 'Settings',
  setup: 'Setup',
  year: 'Year',
  paycheck: 'Paycheck',
  calendar: 'Bill calendar',
  savings: 'Savings',
  debts: 'Debts',
  coach: 'Coach',
  forecast: 'Forecast',
  reports: 'Reports',
  ask: 'Ask',
  help: 'Help',
  start: 'Getting started',
  ai: 'AI settings',
}
