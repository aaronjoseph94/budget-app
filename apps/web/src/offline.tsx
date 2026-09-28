/**
 * "You're offline: figures may be out of date" (plan §9, A26).
 *
 * Every screen reads for itself and says its own failure, which on a lost
 * connection reads as the data being wrong rather than the phone being off
 * the network. One line above the screen says which it is.
 *
 * It is told two ways. The phone says it has no network (`navigator.onLine`
 * and its `offline`/`online` events), which is quick but only knows about
 * the phone's own radio. And the Supabase client's `fetch` is watched: a
 * request that gets no reply at all, which is what `fetch` rejecting means,
 * turns the line on, and any reply, even a refusal, turns it off, since
 * the server was reached. An aborted request says nothing either way.
 */
import { useSyncExternalStore } from 'react'

let unreached = false
const listeners = new Set<() => void>()

function setUnreached(value: boolean): void {
  if (unreached === value) return
  unreached = value
  for (const listener of listeners) listener()
}

/** `inner`, telling the banner whether its requests reach the server. */
export function watchNetwork(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const reply = await inner(input, init)
      setUnreached(false)
      return reply
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setUnreached(true)
      throw cause
    }
  }
}

function subscribe(onChange: () => void): () => void {
  // Back on the network: the next read says whether the server is too.
  const online = () => {
    setUnreached(false)
    onChange()
  }
  listeners.add(onChange)
  window.addEventListener('offline', onChange)
  window.addEventListener('online', online)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('offline', onChange)
    window.removeEventListener('online', online)
  }
}

export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => unreached || navigator.onLine === false,
    () => false,
  )
}

/** The one line, or nothing while the server answers. */
export function OfflineBanner() {
  const offline = useOffline()
  return (
    <p role="status" className="mb-4 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm font-medium empty:hidden">
      {offline ? 'You’re offline: figures may be out of date' : null}
    </p>
  )
}
