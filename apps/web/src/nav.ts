/**
 * Which screen is showing, kept in the URL's #hash.
 *
 * The hash rather than state so that a refresh, or reopening the app from the
 * iPhone home screen, lands where the user was, and the phone's back gesture
 * steps between screens. A router library would add a dependency for five
 * fixed destinations; this is the whole of what they need.
 */
import { useSyncExternalStore } from 'react'

export const SCREENS = ['week', 'review', 'add', 'ledger', 'settings'] as const
export type Screen = (typeof SCREENS)[number]

function current(): Screen {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return (SCREENS as readonly string[]).includes(hash) ? (hash as Screen) : 'week'
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

export function useScreen(): Screen {
  return useSyncExternalStore(subscribe, current, () => 'week')
}

export function navigate(screen: Screen): void {
  if (current() !== screen) window.location.hash = `/${screen}`
  window.scrollTo({ top: 0 })
}
