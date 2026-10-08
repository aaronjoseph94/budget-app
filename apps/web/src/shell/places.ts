import type { Screen } from '../nav.js'
import type { IconName } from '../components/ui/icons.js'
import { SETTINGS_TAB_NAME, isSettingsTab } from '../settings/tab.js'

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
 * screen it belongs to (PARENT). Plan runs shortest period first, then
 * the two screens of their own; the last group is More, Settings and
 * Help, since Setup is Settings' Lists tab (ADR 0014).
 */
export const SIDEBAR_GROUPS: readonly PlaceGroup[] = [
  {
    title: 'Plan',
    items: [
      { screen: 'week', label: 'Week', icon: 'week' },
      { screen: 'month', label: 'Month', icon: 'calendar' },
      { screen: 'year', label: 'Year', icon: 'year' },
      { screen: 'paycheck', label: 'Paycheck', icon: 'wallet' },
      { screen: 'calendar', label: 'Bill calendar', icon: 'bills' },
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
    title: 'More',
    items: [
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
  // Never shown: `#/ai` opens Settings › AI (nav.ts).
  ai: 'AI settings',
}

/**
 * The screens with no item of their own, and the item they light
 * (design-review P1 item 2). Getting started opens from Help, and on the
 * first run (decision 6 of 2026-10-08).
 */
const PARENT: Partial<Record<Screen, Screen>> = { ask: 'coach', start: 'help', ai: 'settings' }

/** The sidebar item lit while a screen shows, or null for More, which a wide screen does not list. */
export function litOf(screen: Screen): Screen | null {
  if (SIDEBAR_GROUPS.some((g) => g.items.some((i) => i.screen === screen))) return screen
  return PARENT[screen] ?? null
}

export interface Crumbs {
  readonly parent: { readonly label: string; readonly screen: Screen }
  readonly current: string
}

/**
 * The top bar's breadcrumb: "Budget › Month" for a screen with an item of
 * its own, and its parent for one without, "Coach › Ask", "Coach ›
 * Check-in", "Help › Getting started"; a Settings tab under Settings,
 * "Settings › AI" (ADR 0014 §2).
 */
export function crumbsOf(screen: Screen, param: string | null): Crumbs {
  if (screen === 'coach' && param === 'checkin') return { parent: { label: 'Coach', screen: 'coach' }, current: 'Check-in' }
  if (screen === 'settings' && param !== null && isSettingsTab(param)) {
    return { parent: { label: 'Settings', screen: 'settings' }, current: SETTINGS_TAB_NAME[param] }
  }
  const parent = PARENT[screen]
  return parent === undefined
    ? { parent: { label: 'Budget', screen: 'month' }, current: SCREEN_NAME[screen] }
    : { parent: { label: SCREEN_NAME[parent], screen: parent }, current: SCREEN_NAME[screen] }
}
