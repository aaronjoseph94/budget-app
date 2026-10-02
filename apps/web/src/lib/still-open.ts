import { useEffect, useRef, type RefObject } from 'react'

/**
 * Whether the editor that called it is still open: true while it is
 * mounted, false once it has closed, so a save that comes back after the
 * editor closed reports elsewhere instead of setting the state of a form
 * no one can see.
 */
export function useStillOpen(): RefObject<boolean> {
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])
  return open
}
