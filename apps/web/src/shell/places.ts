import type { Screen } from '../nav.js'
import type { IconName } from '../components/ui/icons.js'

export interface Place {
  readonly screen: Screen
  readonly label: string
  readonly icon: IconName
}

export interface PlaceGroup {
  readonly title: string
  readonly items: readonly Place[]
}

/**
 * The sidebar's groups, as Mockup A draws them (ADR 0011). Plan is always
 * open; the others fold. Every screen More lists is here, or lights the
 * screen it belongs to (PARENT).
 */
export const SIDEBAR_GROUPS: readonly PlaceGroup[] = [
  {
    title: 'Plan',
    items: [
      { screen: 'month', label: 'Month', icon: 'calendar' },
      { screen: 'week', label: 'Week', icon: 'week' },
      { screen: 'paycheck', label: 'Paycheck', icon: 'wallet' },
      { screen: 'calendar', label: 'Bill calendar', icon: 'bills' },
      { screen: 'year', label: 'Year', icon: 'year' },
    ],
  },
  {
    title: 'Money',
    items: [
      { screen: 'savings', label: 'Savings', icon: 'piggy' },
      { screen: 'debts', label: 'Debts', icon: 'card' },
      { screen: 'ledger', label: 'All transactions', icon: 'file' },
    ],
  },
  {
    title: 'Coach',
    items: [
      { screen: 'coach', label: 'Coach', icon: 'sparkles' },
      { screen: 'forecast', label: 'Forecast', icon: 'trend' },
      { screen: 'reports', label: 'Reports', icon: 'report' },
    ],
  },
  {
    title: 'Inbox',
    items: [
      { screen: 'review', label: 'Review', icon: 'inbox' },
      { screen: 'add', label: 'Add', icon: 'plus' },
    ],
  },
  {
    title: 'Setup',
    items: [
      { screen: 'setup', label: 'Setup', icon: 'list' },
      { screen: 'settings', label: 'Settings', icon: 'settings' },
      { screen: 'help', label: 'Help', icon: 'help' },
    ],
  },
]

/** Each screen's name, as its tab, the sidebar or More names it. */
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

/** The screens with no item of their own, and the item they light (design-review P1 item 2). */
const PARENT: Partial<Record<Screen, Screen>> = { ask: 'coach', ai: 'settings', start: 'settings' }

/** The sidebar item lit while a screen shows, or null for More, which a wide screen does not list. */
export function litOf(screen: Screen): Screen | null {
  if (SIDEBAR_GROUPS.some((g) => g.items.some((i) => i.screen === screen))) return screen
  return PARENT[screen] ?? null
}
