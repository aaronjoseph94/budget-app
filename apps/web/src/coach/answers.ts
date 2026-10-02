/**
 * The check-in's answers, kept in 0017's coach_answers (plan §2.4, A20):
 * Planned, Impulse or Needed for one charge, under the Monday of the week
 * it was asked about (F42). They are the owner's own words about their
 * charges, never a figure, and they are what the impulse share counts.
 *
 * Without 0017 the read says so, and the check-in shows one line pointing
 * to One-time updates where its questions would be; everything else on it
 * still shows.
 */
import { type CheckinAnswer, isoDate } from '@budget/core'
import type { IsoDate } from '@budget/money-primitives'
import { needsOneTimeUpdate, readAll } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

export interface AnswerRow {
  readonly transactionId: string
  readonly answer: CheckinAnswer
  readonly askedWeek: IsoDate
}

export type AnswersRead =
  | { readonly status: 'ready'; readonly rows: readonly AnswerRow[] }
  /** 0017 is not in yet. */
  | { readonly status: 'missing' }
  | { readonly status: 'failed' }

const ANSWERS: ReadonlySet<string> = new Set(['planned', 'impulse', 'needed'])

export async function readAnswers(supabase: SupabaseClient): Promise<AnswersRead> {
  // Every answer, page by page: one request stopped at the server's 1,000
  // rows (architecture-c1-03). One answer per charge (0017's key).
  let data: readonly Record<string, unknown>[]
  try {
    data = await readAll<Record<string, unknown>>(
      (from, to) =>
        supabase.from('coach_answers').select('transaction_id, answer, asked_week', { count: 'exact' }).order('transaction_id').range(from, to),
      { changed: 'The check-in’s answers changed while they were read.', describe: () => 'The check-in’s answers could not be read.' },
      (r) => String(r['transaction_id']),
    )
  } catch (cause) {
    return needsOneTimeUpdate(cause) ? { status: 'missing' } : { status: 'failed' }
  }
  // The database's CHECKs hold these; a row that is not one is skipped rather than counted as something it is not.
  const rows = data.flatMap((r): AnswerRow[] => {
    const { transaction_id: id, answer, asked_week: week } = r
    return typeof id === 'string' && typeof answer === 'string' && ANSWERS.has(answer) && typeof week === 'string'
      ? [{ transactionId: id, answer: answer as CheckinAnswer, askedWeek: isoDate(week) }]
      : []
  })
  return { status: 'ready', rows }
}

/** Keep one answer; a second tap on the same charge changes it. True when it was kept. */
export async function saveAnswer(supabase: SupabaseClient, userId: string, row: AnswerRow): Promise<boolean> {
  const { error } = await supabase
    .from('coach_answers')
    .upsert({ user_id: userId, transaction_id: row.transactionId, answer: row.answer, asked_week: row.askedWeek }, { onConflict: 'user_id,transaction_id' })
  return error === null
}
