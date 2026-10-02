/**
 * What every screen needs, loaded once and refreshed after any write.
 *
 * Deliberately small: the account, the categories, the savings goals and the
 * size of the review queue. Each screen loads its own rows. Nothing derived
 * is held here — every total is recomputed by packages/core when a screen
 * renders.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { orderGoals, type PlacedGoal } from '@budget/core'
import { parseTypedAmount } from '@budget/statement-parsers'
import {
  ensureAccount,
  listCategories,
  listGoals,
  listPending,
  type Category,
  type ListedGoalRow,
} from './ledger.js'
import type { Cents } from '@budget/money-primitives'
import { NO_MARKS, type SetupMarks } from './profile.js'
import { todayIso } from './format.js'
import type { SupabaseClient } from './supabase.js'

const DEFAULT_ACCOUNT = 'Main Card'

export interface AppData {
  readonly supabase: SupabaseClient
  readonly userId: string
  readonly email: string
  /** Your name from Setup, or '' before you have given one. */
  readonly displayName: string
  /** Getting started's steps put off, its hand-ticked iPhone step, and whether it has been opened (profile.ts). */
  readonly setupMarks: SetupMarks
  readonly accountId: string | null
  readonly categories: readonly Category[]
  /** Every savings goal in the owner's order (F45): the active ones, main first, then paused, then reached. */
  readonly goals: readonly ListedGoalRow[]
  /** The first active goal, which the Coach and the Week show; null when none is active. */
  readonly mainGoal: ListedGoalRow | null
  /** Whether 0015 is in: without it, choosing the main goal, moving, pausing and reaching one wait for it. */
  readonly goalsOrdered: boolean
  readonly pendingTotal: number
  readonly loadError: string | null
  /**
   * Whether the data above has been read yet. Until it is 'ready', an empty
   * `categories` and no `mainGoal` mean "not read", not "none": a screen
   * shown then said "Nothing here yet" and offered a made-up goal to save
   * (FE-7). 'failed' is a first read that failed; a later failure keeps
   * what was read and is 'ready' with a `loadError`.
   */
  readonly status: 'loading' | 'ready' | 'failed'
  /** Reload the shared data; bump `version` so screens reload theirs too. */
  readonly refresh: () => Promise<void>
  readonly version: number
  /**
   * The owner's date, read again whenever the app is woken and at midnight.
   * A screen that needs today reads it here, so a page left open overnight
   * moves to the new day with everything else (architecture-c1-01).
   */
  readonly today: string
}

/** A switch back within this long of the last read on the same day reads nothing again. */
const RECENT_MS = 30_000

const Context = createContext<AppData | null>(null)

/** The provider's refresh, or null outside one (a component tested on its own). */
export function useRefresh(): (() => Promise<void>) | null {
  return useContext(Context)?.refresh ?? null
}

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
  setupMarks = NO_MARKS,
  children,
}: {
  supabase: SupabaseClient
  userId: string
  email: string
  displayName?: string
  setupMarks?: SetupMarks
  children: ReactNode
}) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [categories, setCategories] = useState<readonly Category[]>([])
  const [goals, setGoals] = useState<{ readonly rows: readonly ListedGoalRow[]; readonly ordered: boolean }>({ rows: [], ordered: true })
  const [pendingTotal, setPendingTotal] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<AppData['status']>('loading')
  const [version, setVersion] = useState(0)
  // Every editor refreshes after it saves, so two refreshes can be in flight
  // at once, and the older one can be answered last. Only the newest may
  // write: an older answer holds the categories as they were before the
  // save, and showing it would wipe a budget that is stored (CR-1).
  const latest = useRef(0)
  // The account does not change within a session, so it is read once, not
  // on every refresh after every save (PERF-2).
  const account = useRef<Promise<{ readonly id: string }> | null>(null)
  const [today, setToday] = useState(todayIso)
  const lastRead = useRef(0)

  const refresh = useCallback(async () => {
    const mine = ++latest.current
    lastRead.current = Date.now()
    try {
      account.current ??= ensureAccount(supabase, userId, DEFAULT_ACCOUNT)
      const [resolved, cats, read, pending] = await Promise.all([
        account.current,
        listCategories(supabase),
        listGoals(supabase),
        listPending(supabase, 1),
      ])
      if (mine !== latest.current) return
      setAccountId(resolved.id)
      setCategories(cats)
      setGoals({ rows: read.goals, ordered: read.ordered })
      setPendingTotal(pending.total)
      setLoadError(null)
      setStatus('ready')
      setVersion((v) => v + 1)
    } catch (cause) {
      // Asked again next time: a failed lookup is not an answer.
      account.current = null
      if (mine !== latest.current) return
      setLoadError(cause instanceof Error ? cause.message : 'Could not load your data.')
      setStatus((s) => (s === 'ready' ? s : 'failed'))
    }
  }, [supabase, userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // An installed app is suspended with its page loaded, not closed, so the
  // next morning it is woken, not opened. Waking, the network coming back
  // and midnight each read today and the shared data again; refresh bumps
  // `version`, which every screen's read lists, so their rows follow.
  const shown = useRef(todayIso())
  useEffect(() => {
    const wake = (always: boolean) => {
      const now = todayIso()
      const newDay = now !== shown.current
      shown.current = now
      setToday(now)
      if (always || newDay || Date.now() - lastRead.current >= RECENT_MS) void refresh()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake(false)
    }
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) wake(false)
    }
    const onOnline = () => wake(true)
    const midnight = setInterval(() => {
      if (todayIso() !== shown.current) wake(true)
    }, 60_000)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onShow)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(midnight)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onShow)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  const inOrder = useMemo(() => goalsInOrder(goals.rows), [goals.rows])

  return (
    <Context.Provider
      value={{
        supabase,
        userId,
        email,
        displayName,
        setupMarks,
        accountId,
        categories,
        goals: inOrder.goals,
        mainGoal: inOrder.main,
        goalsOrdered: goals.ordered,
        pendingTotal,
        loadError,
        status,
        refresh,
        version,
        today,
      }}
    >
      {children}
    </Context.Provider>
  )
}

/** A goal as core places it (F45), carrying its row so what comes back can be drawn. */
export function placedGoal(row: ListedGoalRow): PlacedGoal & { readonly row: ListedGoalRow } {
  return { id: row.id, sortOrder: row.sort_order, status: row.status, createdAt: row.created_at, row }
}

/** The goals as core orders them (F45), carried whole so every screen reads the same rows. */
function goalsInOrder(rows: readonly ListedGoalRow[]): { readonly goals: readonly ListedGoalRow[]; readonly main: ListedGoalRow | null } {
  const { active, paused, reached, main } = orderGoals({ goals: rows.map(placedGoal) })
  return { goals: [...active, ...paused, ...reached].map((g) => g.row), main: main === null ? null : main.row }
}

/**
 * A dollar amount typed by a person, as cents — or null if it is not one.
 * statement-parsers' parseTypedAmount, which the AI apps server reads
 * amounts with too, so "12.5" means the same in both; the screen never
 * does the arithmetic of turning dollars into cents itself.
 */
export function parseMoneyInput(text: string): Cents | null {
  return parseTypedAmount(text)
}

/**
 * A weekly budget or goal as typed, or the sentence saying why it is not
 * one. The Week's editor and Settings both read budgets through this, so
 * they refuse the same things in the same words (CR-5). `word` is what the
 * field holds, e.g. "weekly budget". An empty field is the caller's to
 * read: Settings takes it as no budget.
 */
export function readBudgetInput(text: string, word: string): { readonly cents: Cents } | { readonly problem: string } {
  const cents = parseMoneyInput(text)
  if (cents === null) return { problem: `Type the ${word} as an amount, like 150 or 150.00.` }
  if (cents < 0) return { problem: `A ${word} cannot be below zero.` }
  return { cents }
}

/**
 * A percentage typed by a person, as hundredths of a percent — "19.99" or
 * "19.99%" is 1999 — or null if it is not one. Hundredths of a percent are
 * read exactly as cents are read from dollars, so it is the same parser.
 */
export function parsePercentInput(text: string): number | null {
  return parseMoneyInput(text.trim().replace(/%$/, ''))
}
