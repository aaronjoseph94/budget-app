/**
 * Your name, as the workbook's START HERE!I3 holds it ("My name is ___").
 *
 * Kept in the Supabase sign-in's own `user_metadata` rather than a table
 * (docs/workbook-views-plan.md §4): it is one short string about the person, and
 * supabase-js updates it with `auth.updateUser({ data })`, which merges the
 * keys it is given into what is there. It is not financial data, but it is
 * still never logged.
 */
import type { SupabaseClient } from './supabase.js'

const NAME_KEY = 'display_name'

/** The stored name, or '' when there is none yet. */
export function displayNameOf(metadata: Readonly<Record<string, unknown>> | undefined): string {
  const name = metadata?.[NAME_KEY]
  return typeof name === 'string' ? name : ''
}

export async function saveDisplayName(supabase: SupabaseClient, name: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ data: { [NAME_KEY]: name } })
  // An auth error's message can quote what was sent, so only this sentence
  // is shown, as describeWriteFailure does for the database.
  if (error !== null) throw new Error('Your name was not saved. Check your connection and try again.')
}

const LATER_KEY = 'setup_later'
const PHONE_KEY = 'setup_phone_ticked'
const OPENED_KEY = 'setup_opened'

/**
 * What Getting started keeps of the owner's own word (plan §8.1): the
 * steps put off with Do this later, the iPhone step ticked by hand, and
 * that the guide has been opened once. Never whether a step is done: that
 * is read from the data every time. Kept beside the name, so it follows
 * the owner to another device with no one-time update.
 */
export interface SetupMarks {
  /** Step ids, in the order they were put off (F49). */
  readonly later: readonly string[]
  readonly phoneTicked: boolean
  /** The first sign-in opens Getting started only while this is false. */
  readonly opened: boolean
}

export const NO_MARKS: SetupMarks = { later: [], phoneTicked: false, opened: false }

/** The marks stored, reading anything else there as none. */
export function setupMarksOf(metadata: Readonly<Record<string, unknown>> | undefined): SetupMarks {
  const later = metadata?.[LATER_KEY]
  return {
    later: Array.isArray(later) ? later.filter((id): id is string => typeof id === 'string') : [],
    phoneTicked: metadata?.[PHONE_KEY] === true,
    opened: metadata?.[OPENED_KEY] === true,
  }
}

/** Keep the marks given, leaving the others and everything else in user_metadata as they are. */
export async function saveSetupMarks(supabase: SupabaseClient, marks: Partial<SetupMarks>): Promise<void> {
  const data: Record<string, unknown> = {}
  if (marks.later !== undefined) data[LATER_KEY] = marks.later
  if (marks.phoneTicked !== undefined) data[PHONE_KEY] = marks.phoneTicked
  if (marks.opened !== undefined) data[OPENED_KEY] = marks.opened
  const { error } = await supabase.auth.updateUser({ data })
  if (error !== null) throw new Error('That was not saved. Check your connection and try again.')
}
