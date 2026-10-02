import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import { needsOneTimeUpdate } from '../ledger.js'

/**
 * One read a screen makes, by key (a month, a week, a pay period), and
 * what it answered (architecture-b-06).
 *
 * Every screen hand-rolled the same protocol: a live flag, the app's
 * version, a latest-read counter, rows tagged with the period they are
 * for, loading and error state. The copies drifted (a list blanked on
 * every reload, a guard forgot to bump its counter, a failed read was
 * never retried). This is the protocol once:
 * - read again when the key changes, when the shared data changes
 *   (`version`, bumped by every save and by waking the app), and on retry;
 * - an answer for a key no longer asked about, or overtaken by a newer read,
 *   is dropped;
 * - while the same key is read again, the last answer stays on screen;
 * - a failure says whether a one-time update is missing;
 * - nothing is read before the shared data's first load.
 * It holds the latest answer for one key only, so it caches nothing: no
 * derived money is kept past the screen that shows it.
 */
export type Read<K extends string, T> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: unknown; readonly missingUpdate: boolean; readonly retry: () => void }
  | { readonly status: 'ready'; readonly key: K; readonly value: T }

type Held<K, T> = { readonly key: K; readonly value: T } | { readonly key: K; readonly error: unknown } | null

export function useRead<K extends string, T>(key: K | null, read: () => Promise<T>): Read<K, T> {
  const { version } = useAppData()
  const [held, setHeld] = useState<Held<K, T>>(null)
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(0)
  // The read as last rendered, so a new closure each render does not read again.
  const reader = useRef(read)
  reader.current = read

  useEffect(() => {
    // Nothing is read before the app's first load (version 0), which the
    // screens each remembered to guard.
    if (key === null || version === 0) return
    const mine = ++latest.current
    reader.current().then(
      (value) => mine === latest.current && setHeld({ key, value }),
      (error: unknown) => mine === latest.current && setHeld({ key, error }),
    )
  }, [key, version, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  if (key === null || held === null || held.key !== key) return { status: 'loading' }
  if ('error' in held) return { status: 'failed', error: held.error, missingUpdate: needsOneTimeUpdate(held.error), retry }
  return { status: 'ready', key: held.key, value: held.value }
}
