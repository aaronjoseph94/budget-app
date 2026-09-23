/**
 * Which screen is showing, and which month or pay period, kept in the URL's
 * #hash.
 *
 * The hash rather than state so that a refresh, the phone's back gesture and
 * reopening the app from the iPhone home screen land where the user was,
 * month included: `#/month/2026-09` (ADR 0003). A router library would add a
 * dependency for a handful of fixed destinations with at most one period
 * each; this is the whole of what they need.
 *
 * Reading a period out of an address is parsing, not arithmetic, so it lives
 * here. Stepping one back or forward is `shiftMonth` or `shiftPayPeriod` in
 * packages/core.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { isoDate } from '@budget/core'

export const SCREENS = ['month', 'week', 'review', 'add', 'more', 'ledger', 'settings', 'setup', 'year', 'paycheck', 'calendar', 'savings', 'debts'] as const
export type Screen = (typeof SCREENS)[number]

/** What a bare or unreadable address opens: Month first (plan §9a, decision 1). */
export const HOME: Screen = 'month'

export interface Address {
  readonly screen: Screen
  /**
   * `YYYY-MM`: the month on the Month screen and the Bill Calendar
   * (`#/calendar/2026-09`), the start month on the Year (`#/year/2026-01`,
   * F14). `YYYY-MM-DD` on Paycheck: a day of the pay
   * period, its payday when the arrows wrote it (`#/paycheck/2026-09-11`).
   * Null for the screen's own default, and on every other screen.
   */
  readonly period: string | null
}

const DEFAULT: Address = { screen: HOME, period: null }
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

/** A real calendar day: `2026-02-30` is refused, not rolled into March. */
function isDay(text: string): boolean {
  try {
    return isoDate(text) === text
  } catch {
    return false
  }
}

/**
 * An address as the app reads it. Anything it cannot read in full (an
 * unknown screen, `2026-13`, `2026-9`, a period on a screen that has none,
 * a third segment) opens HOME rather than a guess at what was meant.
 */
export function readAddress(hash: string): Address {
  const [name = '', period, ...rest] = hash.replace(/^#\/?/, '').split('/')
  const screen = SCREENS.find((s) => s === name)
  if (screen === undefined || rest.length > 0) return DEFAULT
  if (period === undefined) return { screen, period: null }
  if ((screen === 'month' || screen === 'year' || screen === 'calendar') && MONTH.test(period)) return { screen, period }
  return screen === 'paycheck' && isDay(period) ? { screen, period } : DEFAULT
}

export function hashOf(address: Address): string {
  return address.period === null ? `#/${address.screen}` : `#/${address.screen}/${address.period}`
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

export function useScreen(): Screen {
  return useAddress().screen
}

/** Go to a screen; `period` only for the Month, Year and Bill Calendar (`YYYY-MM`) and Paycheck (`YYYY-MM-DD`). */
export function navigate(screen: Screen, period: string | null = null): void {
  const hash = hashOf({ screen, period })
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
