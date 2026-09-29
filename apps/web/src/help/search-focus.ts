import { useEffect, type RefObject } from 'react'

/**
 * The top bar's "Search or jump to…" and ⌘K open Help with its search box
 * focused (ADR 0011). Asked for before Help is drawn, which may be a chunk
 * still loading, so the ask waits here until Help's box takes it; asked
 * while Help's list already shows, the event hands it over at once.
 */
let asked = false
const EVENT = 'budget:help-search'

export function askForHelpSearch(): void {
  asked = true
  window.dispatchEvent(new Event(EVENT))
}

export function useHelpSearchFocus(box: RefObject<HTMLInputElement | null>): void {
  useEffect(() => {
    const take = () => {
      if (!asked) return
      asked = false
      box.current?.focus()
    }
    take()
    window.addEventListener(EVENT, take)
    return () => window.removeEventListener(EVENT, take)
  }, [box])
}
