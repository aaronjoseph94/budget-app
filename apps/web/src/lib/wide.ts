import { useSyncExternalStore } from 'react'

/**
 * Whether the screen is wide enough for a desktop layout: Tailwind's `lg`,
 * 1024px, where the Year takes Workbook's Annual arrangement (plan §6.4).
 *
 * A screen whose phone and desktop layouts differ in what they hold, not
 * only where it sits, draws one of them rather than both with one hidden:
 * the Year's desktop shows seven tables where a phone shows one, and
 * building both would build every table and chart twice. Where the browser
 * cannot say (no matchMedia), it is a phone, the layout that fits anywhere.
 */
const QUERY = '(min-width: 1024px)'

function media(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null
}

function subscribe(onChange: () => void): () => void {
  const list = media()
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

export function useWide(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches === true,
    () => false,
  )
}
