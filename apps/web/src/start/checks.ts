/**
 * Whether each of Getting started's steps is done (plan §8.1, F49), read
 * from the owner's data every time and never stored. A read that failed is
 * "can't check yet", never "done". Two answers are the owner's word: the
 * iPhone step, ticked by hand where the app cannot see the home screen,
 * and AI switched off in AI settings, a choice made and so a step
 * finished. The count, the order and the next step are core's.
 */
import { useEffect, useState } from 'react'
import { SPENDING_LISTS, isoDate, monthBounds, type SetupCheck } from '@budget/core'
import { useAppData } from '../app-data.js'
import { aiStatus, type AiState, type AiView } from '../ai/client.js'
import { getMonthBalance, hasImportedStatement, type Category, type ListedGoalRow } from '../ledger.js'
import { todayIso } from '../format.js'
import { usePaySchedules, type PaySchedules } from '../screens/SetupPay.js'
import { useMonthlyAmounts, type MonthlyAmounts } from '../screens/SetupPlans.js'
import type { StepId } from './steps.js'

/** A read still on its way, a read that failed, or what it found. */
type Read<T> = { readonly status: 'loading' } | { readonly status: 'failed' } | { readonly status: 'ready'; readonly value: T }

/** Everything the nine questions are asked of. */
export interface SetupReads {
  readonly name: string
  readonly categories: readonly Category[]
  readonly goals: readonly ListedGoalRow[]
  /** Rows waiting in Review. */
  readonly pending: number
  readonly schedules: PaySchedules
  readonly amounts: MonthlyAmounts
  readonly statement: Read<boolean>
  readonly balance: Read<number | null>
  /** Null while the helper is asked. */
  readonly ai: AiView | null
  /** Open from the home screen, or ticked by hand. */
  readonly phone: boolean
}

/** Each step's answer; null while its read is on its way. */
export type SetupChecks = Readonly<Record<StepId, SetupCheck | null>>

const OWED: ReadonlySet<Category['kind']> = new Set(['bill', 'debt', 'subscription'])

/** "Turn on free AI": on, or resting with a key that works, or off by choice, is done; unreachable is can't check yet. */
const AI_DONE: Readonly<Record<AiState, SetupCheck>> = {
  on: 'done',
  limit_reached: 'done',
  all_resting: 'done',
  all_failed: 'done',
  off: 'done',
  not_set_up: 'not_done',
  not_deployed: 'not_done',
  needs_update: 'not_done',
  key_rejected: 'not_done',
  keys_locked: 'not_done',
  unreachable: 'unknown',
  not_signed_in: 'unknown',
  helper_error: 'unknown',
}

const yes = (done: boolean): SetupCheck => (done ? 'done' : 'not_done')

function ofRead<T>(read: Read<T>, done: (value: T) => boolean): SetupCheck | null {
  return read.status === 'loading' ? null : read.status === 'failed' ? 'unknown' : yes(done(read.value))
}

export function checksOf(reads: SetupReads): SetupChecks {
  const kind = new Map(reads.categories.map((c) => [c.id, c.kind]))
  const { schedules, amounts } = reads
  return {
    name: yes(reads.name.trim() !== ''),
    lists: yes(reads.categories.some((c) => SPENDING_LISTS.includes(c.kind))),
    pay:
      schedules.status === 'loading'
        ? null
        : schedules.status === 'failed'
          ? 'unknown'
          : yes([...schedules.byCategory.keys()].some((id) => kind.get(id) === 'income')),
    bills:
      amounts.status === 'loading'
        ? null
        : amounts.status === 'failed'
          ? 'unknown'
          : yes(
              [...amounts.plans.values()].some((p) => {
                const list = kind.get(p.categoryId)
                return list !== undefined && OWED.has(list) && p.plannedCents !== null && p.plannedCents > 0
              }),
            ),
    goals: yes(reads.goals.some((g) => g.status === 'active' && g.target_cents > 0)),
    statement: ofRead(reads.statement, (imported) => imported && reads.pending === 0),
    balance: ofRead(reads.balance, (balance) => balance !== null),
    ai: reads.ai === null ? null : AI_DONE[reads.ai.state],
    phone: yes(reads.phone),
  }
}

/** Open from the home screen: Safari's own flag, or the display mode an installed app runs in. */
export function openFromHomeScreen(): boolean {
  const safari = (navigator as Navigator & { readonly standalone?: boolean }).standalone === true
  return safari || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
}

/**
 * The nine answers, re-read with the app's data (`version`), and the
 * helper asked again when `again` changes, as after a key is saved. The
 * name and the tick are passed in: Getting started shows its own change
 * before the sign-in's copy catches up.
 */
export function useSetupChecks({ name, phoneTicked, again = 0 }: { name: string; phoneTicked: boolean; again?: number }): {
  readonly checks: SetupChecks
  readonly ai: AiView | null
} {
  const { supabase, categories, goals, pendingTotal, version } = useAppData()
  const month = monthBounds(isoDate(todayIso())).start
  const schedules = usePaySchedules()
  const amounts = useMonthlyAmounts(month)
  const [statement, setStatement] = useState<Read<boolean>>({ status: 'loading' })
  const [balance, setBalance] = useState<Read<number | null>>({ status: 'loading' })
  const [ai, setAi] = useState<AiView | null>(null)

  useEffect(() => {
    if (version === 0) return
    let live = true
    hasImportedStatement(supabase).then(
      (value) => live && setStatement({ status: 'ready', value }),
      () => live && setStatement({ status: 'failed' }),
    )
    getMonthBalance(supabase, month).then(
      (value) => live && setBalance({ status: 'ready', value }),
      () => live && setBalance({ status: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [supabase, month, version])

  useEffect(() => {
    let live = true
    void aiStatus(supabase).then((view) => live && setAi(view))
    return () => {
      live = false
    }
  }, [supabase, again])

  const phone = phoneTicked || openFromHomeScreen()
  const checks = checksOf({ name, categories, goals, pending: pendingTotal, schedules, amounts, statement, balance, ai, phone })
  return { checks, ai }
}
