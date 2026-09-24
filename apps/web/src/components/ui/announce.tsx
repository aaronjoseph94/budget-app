import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/**
 * One polite status region for the whole app, there from the start.
 *
 * A success message used to arrive in a role="status" element mounted with
 * its words already in it, and screen readers, VoiceOver among them, often
 * say nothing for a region that appears already full (FE-16). A region that
 * is there first, and then has words written into it, is read out. The
 * words stay on screen where they were; this only says them.
 */
const Announce = createContext<((text: string) => void) | null>(null)

/** Say `text` politely, or null where there is no region (a screen rendered on its own). */
export function useAnnounce(): ((text: string) => void) | null {
  return useContext(Announce)
}

export function AnnounceProvider({ children }: { children: ReactNode }) {
  // A counter beside the words: the same message twice in a row is new
  // words to React, so it is written, and read, again.
  const [said, setSaid] = useState({ text: '', n: 0 })
  const announce = useCallback((text: string) => setSaid((s) => ({ text, n: s.n + 1 })), [])
  return (
    <Announce.Provider value={announce}>
      {children}
      <div role="status" aria-live="polite" className="sr-only" data-testid="announcer">
        <span key={said.n}>{said.text}</span>
      </div>
    </Announce.Provider>
  )
}
