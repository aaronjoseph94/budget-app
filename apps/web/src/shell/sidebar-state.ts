import { useCallback, useState } from 'react'

/**
 * What the owner chose for the sidebar on this device (ADR 0011): which
 * groups are open. Kept in browser storage,
 * read and written inside try/catch: a private window or blocked storage
 * throws, and then the choice lasts only until the page reloads.
 */
export const SIDEBAR_KEY = 'budget.sidebar'

interface Chosen {
  readonly open: Readonly<Record<string, boolean>>
}

const NONE: Chosen = { open: {} }

function isRecordOfBooleans(value: unknown): value is Record<string, boolean> {
  return typeof value === 'object' && value !== null && Object.values(value).every((v) => typeof v === 'boolean')
}

/** What storage holds, or nothing chosen when it holds nothing this app wrote. */
function readChosen(): Chosen {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_KEY)
    if (raw === null) return NONE
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return NONE
    const { open } = value as { open?: unknown }
    return { open: isRecordOfBooleans(open) ? open : {} }
  } catch {
    return NONE
  }
}

function writeChosen(chosen: Chosen): boolean {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, JSON.stringify(chosen))
    return true
  } catch {
    return false
  }
}

export interface SidebarState {
  /** Whether a group is open: as chosen, else `unchosen`. */
  readonly isOpen: (title: string, unchosen: boolean) => boolean
  readonly setOpen: (title: string, open: boolean) => void
}

export function useSidebarState(): SidebarState {
  const [chosen, setChosen] = useState(readChosen)
  const choose = useCallback((next: (was: Chosen) => Chosen) => {
    setChosen((was) => {
      const now = next(was)
      writeChosen(now)
      return now
    })
  }, [])
  return {
    isOpen: (title, unchosen) => chosen.open[title] ?? unchosen,
    setOpen: (title, open) => choose((was) => ({ ...was, open: { ...was.open, [title]: open } })),
  }
}
