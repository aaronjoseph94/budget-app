/**
 * The check-in's figures (plan §2.4, A20): the Coach's year of records,
 * renamed for packages/core, through weeklyRecap, questionsToAsk,
 * suggestedWeeklyLimit and impulseShare (F42). Nothing here adds or
 * compares; it only hands the rows over. Throws where the engine refuses a
 * row, so the screen can say the check-in did not load.
 */
import {
  type CheckinQuestion,
  type ImpulseShare,
  type SuggestedLimit,
  type WeeklyRecap,
  impulseShare,
  isoDate,
  questionsToAsk,
  suggestedWeeklyLimit,
  weeklyRecap,
} from '@budget/core'
import type { Category } from '../ledger.js'
import { entriesForCore, weekCategoriesForCore } from '../sheet-input.js'
import type { AnswerRow } from './answers.js'
import { historyOf, type DigestRows } from './facts.js'

export interface CheckinFigures {
  readonly recap: WeeklyRecap
  readonly questions: readonly CheckinQuestion[]
  readonly limit: SuggestedLimit | null
  readonly impulse: ImpulseShare
}

/**
 * `answered` is what was answered when the check-in opened, so a question
 * answered now stays on screen, marked, rather than giving way to the next
 * charge; `answers` is every answer kept, for the impulse share.
 */
export function checkinFigures(read: DigestRows, categories: readonly Category[], answered: readonly string[], answers: readonly AnswerRow[]): CheckinFigures {
  const input = {
    asOf: isoDate(read.asOf),
    historyStart: historyOf(read),
    readFrom: isoDate(read.readFrom),
    // The latest statement's last day, as the Week's "imported up to": a week past it is not all in yet.
    importedThrough: read.statementEnds.map((e) => isoDate(e)).sort().at(-1) ?? null,
    categories: weekCategoriesForCore(categories),
    entries: entriesForCore(read.rows),
  }
  const ids = read.rows.map((r) => r.id)
  return {
    recap: weeklyRecap(input),
    questions: questionsToAsk({ ...input, entries: input.entries.map((e, i) => ({ ...e, id: ids[i]! })), answered }).questions,
    limit: suggestedWeeklyLimit(input),
    impulse: impulseShare({ asOf: input.asOf, answers }),
  }
}
