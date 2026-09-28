import { useEffect, useRef, type RefObject } from 'react'

/**
 * Puts keyboard focus back on what opened an inline editor once it closes.
 *
 * An editor that closes unmounts the field or button that held focus, and
 * the browser drops focus to <body>: a keyboard or screen-reader user starts
 * again from the top of the page (FE-6). `open` is what is open, or null;
 * when it goes back to null with focus lost, the opener of what was open
 * takes it. Focus the user has already moved somewhere else is left alone.
 */
export function useReturnFocus<K>(open: K | null, openerOf: (key: K) => HTMLElement | null | undefined): void {
  const was = useRef<K | null>(null)
  const find = useRef(openerOf)
  useEffect(() => {
    find.current = openerOf
  })
  useEffect(() => {
    const closed = was.current
    was.current = open
    if (closed === null || open !== null) return
    const now = document.activeElement
    if (now === null || now === document.body) find.current(closed)?.focus()
  }, [open])
}

/**
 * Moves focus to the first item a "Show more" drew. The button pressed goes
 * away once the last of a list is drawn, and focus fell to <body>, out of a
 * sheet it was in (PERF-10). Call the returned function with the index of
 * the first new item as it is pressed; once `count` items are drawn, that
 * item's first control takes focus.
 */
export function useFocusDrawn(list: RefObject<HTMLElement | null>, count: number): (first: number) => void {
  const first = useRef<number | null>(null)
  useEffect(() => {
    if (first.current === null) return
    const item = list.current?.children[first.current]
    first.current = null
    item?.querySelector<HTMLElement>('button, select, input, a[href]')?.focus()
  }, [list, count])
  return (index) => {
    first.current = index
  }
}
