/**
 * The month in review, in words (plan §2.6, §3.11 feature 10, A15).
 *
 * core's monthReport says what is true of the month; this says it. The
 * facts here are the review's figures by slot, each with the direction,
 * size and evidence core gave it, so a sentence can only name figures the
 * engine made. The app's own words come first, in either tone, and the AI's
 * brief is made from the same facts with every figure left out (ADR 0005):
 * a headline, three points and one thing to try.
 */
import type { Evidence, Figure, MonthReport, Mover, TotalChange } from '@budget/core'
import type { Cents } from '@budget/money-primitives'
import type { NarrateFact, NarrateReport } from '@budget/schema'
import { letterOf, maskLabel } from './payload.js'
import type { Tone } from './templates.js'

export type ReportFactKind = 'month_spent' | 'month_saved' | 'month_income' | 'mover_up' | 'mover_down'

/** A figure of the review a sentence may name, as the Coach's facts are (ADR 0005 §1). */
export interface ReportFact {
  /** Stable while its subject is: `report:spent`, `cat:<id>:mover`. */
  readonly key: string
  readonly kind: ReportFactKind
  readonly subject: { readonly label: string }
  readonly direction: 'up' | 'down' | 'same' | 'none'
  readonly size: 'slight' | 'clear' | 'big' | null
  readonly evidence: Evidence
  readonly meaning: 'good' | 'watch' | 'info'
  readonly figures: Readonly<Record<string, Figure>>
}

/** A review that has figures: so far, complete or partly recorded. */
export type ReviewedMonth = Extract<MonthReport, { readonly totals: unknown }>

export interface ReportFacts {
  /** Each fact by its letter in the brief. */
  readonly facts: Readonly<Record<string, ReportFact>>
  /** The letters to word as the review's points, at most three. */
  readonly points: readonly string[]
  /** The letter the one thing to try is about: the largest rise, or none. */
  readonly tryThis: string | null
  /** Letters of the largest rise and fall, for the headline. */
  readonly up: string | null
  readonly down: string | null
  readonly soFar: boolean
}

const DIRECTION = { more: 'up', less: 'down', same: 'same' } as const

/** The review's facts, lettered in the order the brief gives them. */
export function reportFacts(input: { readonly report: ReviewedMonth; readonly nameOf: (categoryId: string) => string }): ReportFacts {
  const { report } = input
  const last = report.lastMonth.status === 'compared' ? report.lastMonth : null
  const lastMonth: Figure | null = last === null ? null : { unit: 'month', value: last.window.from }
  const total = (kind: ReportFactKind, label: string, now: Cents, change: TotalChange | null, usual: Cents | null, extra: Record<string, Figure> = {}): ReportFact => ({
    key: `report:${kind.slice('month_'.length)}`,
    kind,
    subject: { label },
    direction: change === null ? 'none' : DIRECTION[change.change.direction],
    size: change === null ? null : change.size,
    // Two windows and no baseline: thin, as the Coach's summaries are (F27).
    evidence: 'thin',
    meaning: change === null || change.change.meaning === 'neutral' ? 'info' : change.change.meaning,
    figures: {
      now: { unit: 'cents', value: now },
      ...(change === null || lastMonth === null ? {} : { change: { unit: 'change', value: change.change.changeCents, direction: change.change.direction }, last_month: lastMonth }),
      ...(usual === null ? {} : { usual: { unit: 'cents', value: usual } }),
      ...extra,
    },
  })
  const { totals, usual } = report
  const rate: Record<string, Figure> = totals.savingsRateBp === null ? {} : { rate: { unit: 'share', value: totals.savingsRateBp } }
  const mover = (m: Mover, up: boolean): ReportFact => ({
    key: `cat:${m.categoryId}:mover`,
    kind: up ? 'mover_up' : 'mover_down',
    subject: { label: input.nameOf(m.categoryId) },
    direction: up ? 'up' : 'down',
    size: m.size,
    evidence: m.evidence,
    meaning: up ? 'watch' : 'good',
    figures: {
      now: { unit: 'cents', value: m.nowCents },
      usual: { unit: 'cents', value: m.usualCents },
      change: { unit: 'change', value: m.changeCents, direction: up ? 'more' : 'less' },
    },
  })
  const list: ReportFact[] = [
    total('month_spent', 'Spent', totals.spentCents, last?.spent ?? null, usual?.spent.beforeCents ?? null),
    total('month_saved', 'Saved', totals.savedCents, last?.saved ?? null, usual?.saved.beforeCents ?? null, rate),
    total('month_income', 'Income', totals.incomeCents, last?.income ?? null, usual?.income.beforeCents ?? null),
    ...report.movers.up.map((m) => mover(m, true)),
    ...report.movers.down.map((m) => mover(m, false)),
  ]
  const facts = Object.fromEntries(list.map((f, i) => [letterOf(i), f]))
  const letter = (kind: ReportFactKind) => Object.keys(facts).find((l) => facts[l]!.kind === kind) ?? null
  const up = letter('mover_up')
  const down = letter('mover_down')
  // Spent (A) and Saved (B), then the largest change against the usual month, else what came in.
  const third = up ?? down ?? letter('month_income')!
  return { facts, points: ['A', 'B', third], tryThis: up, up, down, soFar: report.status === 'so_far' }
}

/** The AI's brief: the facts' words and blank names, never a figure (ADR 0005 §2). */
export function reportBrief(input: { readonly facts: ReportFacts; readonly tone: Tone }): { readonly brief: NarrateReport; readonly keys: Readonly<Record<string, string>> } {
  const { facts, points, tryThis } = input.facts
  const briefFacts: NarrateFact[] = Object.entries(facts).map(([id, f]) => ({
    id,
    kind: f.kind,
    about: maskLabel(f.subject.label),
    direction: f.direction,
    size: f.size,
    evidence: f.evidence,
    meaning: f.meaning,
    slots: ['name', ...Object.keys(f.figures)],
  }))
  return {
    brief: { tone: input.tone, facts: briefFacts, points, tryThis },
    keys: Object.fromEntries(Object.entries(facts).map(([id, f]) => [id, f.key])),
  }
}
