import { useSyncExternalStore } from 'react'

/**
 * Whether the screen is wide enough for a desktop layout.
 *
 * A screen whose phone and desktop layouts differ in what they hold, not
 * only where it sits, draws one of them rather than both with one hidden:
 * the Year's desktop shows seven tables where a phone shows one, and
 * building both would build every table and chart twice. Where the browser
 * cannot say (no matchMedia), it is a phone, the layout that fits anywhere.
 */
function watch(query: string) {
  const media = (): MediaQueryList | null => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)
  return {
    subscribe(onChange: () => void): () => void {
      const list = media()
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    matches: () => media()?.matches === true,
  }
}

const LG = watch('(min-width: 1024px)')
const XL = watch('(min-width: 1280px)')

/** Tailwind's `lg`, 1024px, where the sidebar begins (ADR 0011). */
export function useWide(): boolean {
  return useSyncExternalStore(LG.subscribe, LG.matches, () => false)
}

/**
 * Tailwind's `xl`, 1280px, where the Year shows all seven tables four
 * across (design-review P2 item 7); narrower, its chips choose one.
 */
export function useFourAcross(): boolean {
  return useSyncExternalStore(XL.subscribe, XL.matches, () => false)
}
