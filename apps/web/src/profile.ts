/**
 * Your name, as Workbook's START HERE!I3 holds it ("My name is ___").
 *
 * Kept in the Supabase sign-in's own `user_metadata` rather than a table
 * (docs/workbook-plan.md §4): it is one short string about the person, and
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
