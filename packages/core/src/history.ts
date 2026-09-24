/**
 * Where the records start (F24, docs/formula-decisions.md).
 *
 * The workbook never compares one period with another, so it has no such
 * cell. A comparison, a baseline or a forecast that reached back before the
 * records would read a missing month as $0 and report a huge change that
 * never happened, so every one of them asks this first.
 *
 * A statement's period wins over an earlier typed row: card charges are most
 * of the spending, so a month is whole only from the first statement on. The
 * ledger's earliest date stands in only when no statement has a period.
 */
import type { IsoDate } from '@budget/money-primitives'
import { shiftMonth } from './week.js'

export interface HistoryStartInput {
  /** The first day of each imported statement's period (0007), in any order. */
  readonly statementPeriodStarts: readonly IsoDate[]
  /** Ledger dates, in any order; only the earliest matters, and only with no statement. */
  readonly entryDates: readonly IsoDate[]
}

export interface HistoryStart {
  /** The first day the records cover, or null when there are none. */
  readonly start: IsoDate | null
  /** What it was taken from. */
  readonly from: 'statement' | 'ledger' | 'none'
}

export function historyStart(input: HistoryStartInput): HistoryStart {
  const fromStatements = earliest(input.statementPeriodStarts)
  if (fromStatements !== null) return { start: fromStatements, from: 'statement' }
  const fromLedger = earliest(input.entryDates)
  return fromLedger === null ? { start: null, from: 'none' } : { start: fromLedger, from: 'ledger' }
}

function earliest(dates: readonly IsoDate[]): IsoDate | null {
  return dates.reduce<IsoDate | null>((first, d) => (first === null || d < first ? d : first), null)
}

/** How much history a figure rests on (F24): thin with 0–2 complete months, some with 3–5, solid with 6 or more. */
export type Evidence = 'thin' | 'some' | 'solid'

export function evidenceOf(completeMonths: number): Evidence {
  return completeMonths >= 6 ? 'solid' : completeMonths >= 3 ? 'some' : 'thin'
}

export interface CompleteMonthsInput {
  /** Today: its month is still running, so never complete. */
  readonly asOf: IsoDate
  /** From historyStart; null when there are no records. */
  readonly historyStart: IsoDate | null
  /** The first day the caller read rows from. A month before it was not read, so it is missing, not $0. */
  readonly readFrom: IsoDate
}

export interface CompleteMonths {
  /** Each complete month by its first day, newest first. */
  readonly months: readonly IsoDate[]
  readonly evidence: Evidence
}

/** F24: the months wholly inside the records and what was read, and before asOf's month. */
export function completeMonths(input: CompleteMonthsInput): CompleteMonths {
  const months: IsoDate[] = []
  if (input.historyStart !== null) {
    const first = input.historyStart > input.readFrom ? input.historyStart : input.readFrom
    // A month is whole only when it starts on or after the first day covered.
    for (let m = shiftMonth(input.asOf, -1); m >= first; m = shiftMonth(m, -1)) months.push(m)
  }
  return { months, evidence: evidenceOf(months.length) }
}
