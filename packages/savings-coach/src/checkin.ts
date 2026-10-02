/**
 * The Sunday check-in, as facts a sentence may name (plan §2.4, §3.11
 * feature 7, A20; ADR 0005 §1, §2).
 *
 * core's weeklyRecap, suggestedWeeklyLimit and impulseShare say what is
 * true of last week (F42); this letters those figures, decides which one
 * is the week's win, and briefs the AI with every figure left out. The
 * goals are named as the daily brief names them (G1): the main goal first,
 * each by its blank, never by an amount.
 */
import type { Evidence, Figure, ImpulseShare, SuggestedLimit, WeeklyRecap } from '@budget/core'
import type { NarrateCheckin } from '@budget/schema'
import { FACT_DIRECTION, briefFactsOf, letterOf, maskLabel, type PayloadGoal } from './payload.js'
import type { Tone } from './templates.js'

export type CheckinFactKind = 'week_spent' | 'week_top' | 'no_spend_days' | 'impulse_share'

/** A figure of the check-in a sentence may name, as the Coach's facts are (ADR 0005 §1). */
export interface CheckinFact {
  /** Stable while its subject is: `week:spent`, `cat:<id>:week_top`. */
  readonly key: string
  readonly kind: CheckinFactKind
  readonly subject: { readonly label: string }
  readonly direction: 'up' | 'down' | 'same' | 'none'
  readonly size: 'slight' | 'clear' | 'big' | null
  readonly evidence: Evidence
  readonly meaning: 'good' | 'watch' | 'info'
  readonly figures: Readonly<Record<string, Figure>>
}

/** A goal a sentence may name: its name, and no figure. */
export interface CheckinGoal {
  readonly key: string
  readonly subject: { readonly label: string }
  readonly figures: Readonly<Record<string, Figure>>
  readonly main: boolean
  readonly unit: 'hours' | 'dollars'
}

/** Why the week's win is one: kept within the budgets, less than the week before, or days with none. */
export type WinReason = 'kept' | 'less' | 'no_spend'

export interface CheckinFacts {
  /** Each fact by its letter in the brief. */
  readonly facts: Readonly<Record<string, CheckinFact>>
  /** The goals by their letters, after the facts', main first. */
  readonly goals: Readonly<Record<string, CheckinGoal>>
  /** The letter of each part's fact, or null. */
  readonly recap: string | null
  readonly top: string | null
  readonly impulse: string | null
  readonly win: { readonly letter: string; readonly reason: WinReason } | null
  readonly mainGoal: string | null
}

/** A fact with no change to size, on a week or two of records: thin, as the Coach's summaries are (F27). */
const QUIET = { direction: 'none', size: null, evidence: 'thin' } as const

export function checkinFacts(input: {
  readonly recap: WeeklyRecap
  readonly limit: SuggestedLimit | null
  readonly impulse: ImpulseShare
  /** The active goals, main first (F45). */
  readonly goals: readonly PayloadGoal[]
  readonly nameOf: (categoryId: string) => string
}): CheckinFacts {
  const { recap, limit, impulse } = input
  const list: { role: 'recap' | 'top' | 'no_spend' | 'impulse'; fact: CheckinFact }[] = []
  if (recap.status === 'ready') {
    const { budget, before } = recap
    list.push({
      role: 'recap',
      fact: {
        key: 'week:spent',
        kind: 'week_spent',
        subject: { label: 'Everyday spending' },
        direction: before === null ? 'none' : FACT_DIRECTION[before.change.direction],
        size: null,
        // Two weeks and no baseline: thin, as the Coach's summaries are (F27).
        evidence: 'thin',
        meaning: budget !== null ? (budget.kept ? 'good' : 'watch') : before?.change.direction === 'less' ? 'good' : 'info',
        figures: {
          now: { unit: 'cents', value: recap.spentCents },
          ...(before === null ? {} : { change: { unit: 'change', value: before.change.changeCents, direction: before.change.direction } }),
          ...(budget === null ? {} : { budget: { unit: 'cents', value: budget.budgetCents } }),
          ...(budget === null ? {} : budget.kept ? { left: { unit: 'cents', value: budget.leftCents } } : { over: { unit: 'cents', value: budget.overCents } }),
        },
      },
    })
    if (limit !== null) {
      const figures: Record<string, Figure> = { now: { unit: 'cents', value: limit.lastWeekCents }, limit: { unit: 'cents', value: limit.limitCents } }
      list.push({ role: 'top', fact: { key: `cat:${limit.categoryId}:week_top`, kind: 'week_top', subject: { label: input.nameOf(limit.categoryId) }, ...QUIET, meaning: 'watch', figures } })
    }
    if (recap.noSpendDays > 0) {
      const figures: Record<string, Figure> = { days: { unit: 'count', value: recap.noSpendDays } }
      list.push({ role: 'no_spend', fact: { key: 'week:no_spend', kind: 'no_spend_days', subject: { label: 'Days with no everyday spending' }, ...QUIET, meaning: 'good', figures } })
    }
  }
  if (impulse.shareBp !== null) {
    const figures: Record<string, Figure> = { share: { unit: 'share', value: impulse.shareBp }, answers: { unit: 'count', value: impulse.answers } }
    list.push({ role: 'impulse', fact: { key: 'answers:impulse', kind: 'impulse_share', subject: { label: 'Charges you called impulse' }, ...QUIET, meaning: 'info', figures } })
  }

  const facts = Object.fromEntries(list.map((x, i) => [letterOf(i), x.fact]))
  const letter = (role: (typeof list)[number]['role']) => {
    const i = list.findIndex((x) => x.role === role)
    return i === -1 ? null : letterOf(i)
  }
  const goals = Object.fromEntries(
    input.goals.map((g, i): [string, CheckinGoal] => [letterOf(list.length + i), { key: `goal:${g.id}`, subject: { label: g.name }, figures: {}, main: g.main, unit: g.hasHours ? 'hours' : 'dollars' }]),
  )

  // A win first (ADR 0005 §9): kept within the budgets, else less than the week before, else days with none.
  const recapLetter = letter('recap')
  const spent = recapLetter === null ? null : facts[recapLetter]!
  const noSpend = letter('no_spend')
  const win: CheckinFacts['win'] =
    spent !== null && 'left' in spent.figures
      ? { letter: recapLetter!, reason: 'kept' }
      : spent !== null && spent.direction === 'down'
        ? { letter: recapLetter!, reason: 'less' }
        : noSpend !== null
          ? { letter: noSpend, reason: 'no_spend' }
          : null
  return { facts, goals, recap: recapLetter, top: letter('top'), impulse: letter('impulse'), win, mainGoal: Object.keys(goals)[0] ?? null }
}

/** The AI's brief: the facts' words and blank names, never a figure (ADR 0005 §2). */
export function checkinBrief(input: { readonly facts: CheckinFacts; readonly tone: Tone }): { readonly brief: NarrateCheckin; readonly keys: Readonly<Record<string, string>> } {
  const { facts, goals, recap, top, win } = input.facts
  const briefFacts = briefFactsOf(facts)
  return {
    brief: {
      tone: input.tone,
      facts: briefFacts,
      recap,
      win: win?.letter ?? null,
      tryThis: top,
      goals: Object.entries(goals).map(([id, g]) => ({ id, about: maskLabel(g.subject.label), main: g.main, unit: g.unit })),
    },
    keys: Object.fromEntries([...Object.entries(facts), ...Object.entries(goals)].map(([id, f]) => [id, f.key])),
  }
}
