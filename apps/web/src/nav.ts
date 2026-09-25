/**
 * Which screen is showing, and which month, week, pay period or help topic,
 * kept in the URL's #hash.
 *
 * The hash rather than state so that a refresh, the phone's back gesture and
 * reopening the app from the iPhone home screen land where the user was,
 * month included: `#/month/2026-09` (ADR 0003). A router library would add a
 * dependency for a handful of fixed destinations with at most one param
 * each; this is the whole of what they need (ADR 0006 extends it).
 *
 * Reading a period out of an address is parsing, not arithmetic, so it lives
 * here. Stepping one back or forward is `shiftMonth` or `shiftPayPeriod` in
 * packages/core.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { isoDate, weekBounds } from '@budget/core'
import { HELP_TOPICS } from './help/topics.js'

export const SCREENS = [
  'month', 'week', 'review', 'add', 'more', 'ledger', 'settings', 'setup', 'year', 'paycheck', 'calendar', 'savings', 'debts',
  'coach', 'forecast', 'reports', 'ask', 'help', 'start', 'ai',
] as const
export type Screen = (typeof SCREENS)[number]

/**
 * Screens whose address already reads (ADR 0006) but whose slice has not
 * landed. Each slice takes its screen out as it adds it. Until then the bars
 * and More leave it out, so no tab opens a promise, and its address opens
 * one line saying it is on its way.
 */
const NOT_BUILT: ReadonlySet<Screen> = new Set(['reports', 'ask', 'start'])

export function isBuilt(screen: Screen): boolean {
  return !NOT_BUILT.has(screen)
}

/** What a bare or unreadable address opens: Month first (plan §9a, decision 1). */
export const HOME: Screen = 'month'

export interface Address {
  readonly screen: Screen
  /**
   * What the screen is showing, read by a rule of its own (ADR 0006):
   * `YYYY-MM` on the Month, the Bill Calendar and Reports (`#/reports/2026-08`)
   * and the start month on the Year (`#/year/2026-01`, F14); a real day of a
   * pay period on Paycheck (`#/paycheck/2026-09-11`); a Monday on the Week
   * (`#/week/2026-09-21`); a committed topic id on Help (`#/help/updates`);
   * `checkin` on the Coach. Null for the screen's own default, and on every
   * other screen.
   */
  readonly param: string | null
}

const DEFAULT: Address = { screen: HOME, param: null }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** A real calendar day: `2026-02-30` is refused, not rolled into March. */
function isDay(text: string): boolean {
  try {
    return isoDate(text) === text
  } catch {
    return false
  }
}

/** The rule each screen that takes a param reads it by; a screen not here takes none. */
const PARAM: Partial<Record<Screen, (param: string) => boolean>> = {
  month: (p) => MONTH.test(p),
  year: (p) => MONTH.test(p),
  calendar: (p) => MONTH.test(p),
  reports: (p) => MONTH.test(p),
  paycheck: isDay,
  // A week is named by its Monday, so each week has one address.
  week: (p) => isDay(p) && weekBounds(isoDate(p)).start === p,
  help: (p) => HELP_TOPICS.some((t) => t === p),
  coach: (p) => p === 'checkin',
}

/**
 * An address as the app reads it. Anything it cannot read in full (an
 * unknown screen, `2026-13`, `2026-9`, a Tuesday on the Week, a topic that
 * is not committed, a param on a screen that has none, a third segment)
 * opens HOME rather than a guess at what was meant.
 */
export function readAddress(hash: string): Address {
  const [name = '', param, ...rest] = hash.replace(/^#\/?/, '').split('/')
  const screen = SCREENS.find((s) => s === name)
  if (screen === undefined || rest.length > 0) return DEFAULT
  if (param === undefined) return { screen, param: null }
  return PARAM[screen]?.(param) === true ? { screen, param } : DEFAULT
}

export function hashOf(address: Address): string {
  return address.param === null ? `#/${address.screen}` : `#/${address.screen}/${address.param}`
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

const currentHash = () => window.location.hash

export function useAddress(): Address {
  const hash = useSyncExternalStore(subscribe, currentHash, () => '')
  return useMemo(() => readAddress(hash), [hash])
}

/** Go to a screen, with a param only where its rule above reads one. */
export function navigate(screen: Screen, param: string | null = null): void {
  const hash = hashOf({ screen, param })
  if (window.location.hash !== hash) window.location.hash = hash.slice(1)
  window.scrollTo({ top: 0 })
}

/**
 * Home-screen reopen. An iPhone reopens an app it has closed at the start
 * address, `/`, which has no hash; the last address is kept on this device
 * so that reopening lands on the month that was showing. It is a convenience
 * only: when storage is refused (a private window) the app opens this month,
 * as a first visit does.
 */
const KEY = 'budget.address'

export function restoreAddress(storage: Pick<Storage, 'getItem' | 'setItem'> | null): void {
  if (storage === null) return
  const remember = () => {
    try {
      storage.setItem(KEY, hashOf(readAddress(window.location.hash)))
    } catch {
      // Not remembered this time; the address itself still holds the month.
      return
    }
  }
  try {
    const kept = storage.getItem(KEY)
    if (window.location.hash.replace(/^#\/?/, '') === '' && kept !== null) {
      window.history.replaceState(null, '', hashOf(readAddress(kept)))
    }
  } catch {
    // Storage refused: open as a first visit does.
    return
  }
  remember()
  window.addEventListener('hashchange', remember)
}
