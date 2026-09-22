/**
 * What every screen needs, loaded once and refreshed after any write.
 *
 * Deliberately small: the account, the categories, the goal and the size of
 * the review queue. Each screen loads its own rows. Nothing derived is held
 * here — every total is recomputed by packages/core when a screen renders.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
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
  readonly accountId: string | null
  readonly categories: readonly Category[]
  readonly goal: GoalRow | null
  readonly pendingTotal: number
  readonly loadError: string | null
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
  children,
}: {
  supabase: SupabaseClient
  userId: string
  email: string
  children: ReactNode
}) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categories, setCategories] = useState<readonly Category[]>([])
  const [goal, setGoal] = useState<GoalRow | null>(null)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const [account, cats, g, pending] = await Promise.all([
        ensureAccount(supabase, userId, DEFAULT_ACCOUNT),
        listCategories(supabase),
        getGoal(supabase),
        listPending(supabase, 1),
      ])
      setAccountId(account.id)
      setCategories(cats)
      setGoal(g)
      setPendingTotal(pending.total)
      setLoadError(null)
      setVersion((v) => v + 1)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Could not load your data.')
    }
  }, [supabase, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <Context.Provider
      value={{ supabase, userId, email, accountId, categories, goal, pendingTotal, loadError, refresh, version }}
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
