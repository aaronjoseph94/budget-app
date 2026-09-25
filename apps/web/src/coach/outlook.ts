/**
 * When each active goal is reached at the owner's pace, and what to trim to
 * get there sooner (F33, F34; plan slice A08), for the Coach and Savings.
 *
 * The rows are the year useCoachRead reads; the goals come through
 * goalsForCore. goalForecast gives the dates and goalLevers the levers, set
 * against the forecast's middle pace. Nothing is added up here.
 */
import { useMemo } from 'react'
import { goalForecast, goalLevers, isoDate, type GoalForecast, type GoalLevers } from '@budget/core'
import { useAppData } from '../app-data.js'
import type { Category } from '../ledger.js'
import { categoriesForCore, entriesForCore } from '../sheet-input.js'
import { historyOf, type DigestRows } from './facts.js'
import type { CoreGoal } from './goals.js'

export interface GoalOutlook {
  readonly forecast: GoalForecast
  readonly levers: GoalLevers
}

/** Each goal's outlook, by id. Throws where the engine refuses a row. */
export function goalOutlooks(
  read: DigestRows,
  categories: readonly Category[],
  goals: readonly CoreGoal[],
): ReadonlyMap<string, GoalOutlook> {
  const shared = {
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    categories: categoriesForCore(categories),
    entries: entriesForCore(read.rows),
  }
  return new Map(
    goals.map((goal) => {
      const forecast = goalForecast({ ...shared, goal })
      const levers = goalLevers({
        ...shared,
        goal: { remainingCents: forecast.remainingCents, unitCostCents: goal.unitCostCents },
        paceWeeklyCents: forecast.paceWeeklyCents,
      })
      return [goal.id, { forecast, levers }]
    }),
  )
}

export type Outlooks =
  | { readonly status: 'loading' }
  /** The year's read failed, or the engine refused a row. */
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly byGoal: ReadonlyMap<string, GoalOutlook> }

/** Loading until the year's read and the goals (which wait for the funds) are in. */
export function useGoalOutlooks(read: DigestRows | 'failed' | null, goals: readonly CoreGoal[] | null): Outlooks {
  const { categories } = useAppData()
  return useMemo((): Outlooks => {
    if (read === 'failed') return { status: 'failed' }
    if (read === null || goals === null) return { status: 'loading' }
    try {
      return { status: 'ready', byGoal: goalOutlooks(read, categories, goals) }
    } catch {
      return { status: 'failed' }
    }
  }, [read, goals, categories])
}
