/**
 * What every screen needs, loaded once and refreshed after any write.
 *
 * Deliberately small: the account, the categories, the goal and the size of
 * the review queue. Each screen loads its own rows. Nothing derived is held
 * here — every total is recomputed by packages/core when a screen renders.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { US_AMOUNT_FORMAT, parseAmountToCents } from '@budget/statement-parsers'
import {
  ensureAccount,
  getGoal,
  listCategories,
  listPending,
  type Category,
  type GoalRow,
} from './ledger.js'
import type { Cents } from '@budget/money-primitives'
import type { SupabaseClient } from './supabase.js'

const DEFAULT_ACCOUNT = 'Main Card'

export interface AppData {
  readonly supabase: SupabaseClient
  readonly userId: string
  readonly email: string
  /** Your name from Setup, or '' before you have given one. */
  readonly displayName: string
  readonly accountId: string | null
  readonly categories: readonly Category[]
  readonly goal: GoalRow | null
  readonly pendingTotal: number
  readonly loadError: string | null
  /**
   * Whether the data above has been read yet. Until it is 'ready', an empty
   * `categories` and a null `goal` mean "not read", not "none": a screen
   * shown then said "Nothing here yet" and offered a made-up goal to save
   * (FE-7). 'failed' is a first read that failed; a later failure keeps
   * what was read and is 'ready' with a `loadError`.
   */
  readonly status: 'loading' | 'ready' | 'failed'
  /** Reload the shared data; bump `version` so screens reload theirs too. */
  readonly refresh: () => Promise<void>
  readonly version: number
}

const Context = createContext<AppData | null>(null)

export function useAppData(): AppData {
  const data = useContext(Context)
  if (data === null) throw new Error('useAppData outside AppDataProvider')
  return data
}

export function AppDataProvider({
  supabase,
  userId,
  email,
  displayName = '',
  children,
}: {
  supabase: SupabaseClient
  userId: string
  email: string
  displayName?: string
  children: ReactNode
}) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categories, setCategories] = useState<readonly Category[]>([])
  const [goal, setGoal] = useState<GoalRow | null>(null)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<AppData['status']>('loading')
  const [version, setVersion] = useState(0)
  // Every editor refreshes after it saves, so two refreshes can be in flight
  // at once, and the older one can be answered last. Only the newest may
  // write: an older answer holds the categories as they were before the
  // save, and showing it would wipe a budget that is stored (CR-1).
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++latest.current
    try {
      const [account, cats, g, pending] = await Promise.all([
        ensureAccount(supabase, userId, DEFAULT_ACCOUNT),
        listCategories(supabase),
        getGoal(supabase),
        listPending(supabase, 1),
      ])
      if (mine !== latest.current) return
      setAccountId(account.id)
      setCategories(cats)
      setGoal(g)
      setPendingTotal(pending.total)
      setLoadError(null)
      setStatus('ready')
      setVersion((v) => v + 1)
    } catch (cause) {
      if (mine !== latest.current) return
      setLoadError(cause instanceof Error ? cause.message : 'Could not load your data.')
      setStatus((s) => (s === 'ready' ? s : 'failed'))
    }
  }, [supabase, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <Context.Provider
      value={{ supabase, userId, email, displayName, accountId, categories, goal, pendingTotal, loadError, status, refresh, version }}
    >
      {children}
    </Context.Provider>
  )
}

/**
 * A dollar amount typed by a person, as cents — or null if it is not one.
 *
 * Parsed by the same function that reads statements, so "12.5", "12.50",
 * "$1,234.00" and "1234" mean here exactly what they mean in a CSV, and the
 * screen never does the arithmetic of turning dollars into cents itself.
 */
export function parseMoneyInput(text: string): Cents | null {
  const trimmed = text.trim().replace(/^\$/, '')
  if (trimmed.length === 0) return null
  const withCents = /\.\d{2}$/.test(trimmed) ? trimmed : /\.\d$/.test(trimmed) ? `${trimmed}0` : `${trimmed}.00`
  const parsed = parseAmountToCents(withCents, US_AMOUNT_FORMAT)
  return parsed.ok ? parsed.value : null
}

/**
 * A percentage typed by a person, as hundredths of a percent — "19.99" or
 * "19.99%" is 1999 — or null if it is not one. Hundredths of a percent are
 * read exactly as cents are read from dollars, so it is the same parser.
 */
export function parsePercentInput(text: string): number | null {
  return parseMoneyInput(text.trim().replace(/%$/, ''))
}
