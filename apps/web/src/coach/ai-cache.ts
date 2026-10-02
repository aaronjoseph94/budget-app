/**
 * The AI's words kept for reuse, in 0017's ai_notes (plan §3.8, ADR 0005 §6).
 *
 * Only checked words are kept: a sentence with blanks, never a figure, so
 * no amount can go stale here. Each note carries the signatures of the
 * claims it was written for, hashed here with WebCrypto: the whole brief
 * (`facts_sig`), and each card, line and goal line (`card_sigs`), with the
 * prompt's version in every hash. Words are reused only while their
 * signature still matches today's claims.
 *
 * Words read back are model output too: each note's body is parsed again
 * with the same rule before it is used, and a note that fails is passed
 * over. Before a note is written, the body is checked once more for any
 * number or currency sign; 0017's CHECK is the database's backstop behind
 * that, so a digit can never be stored, even by a bug here.
 */
import { AiProviderSchema, NARRATE_PROMPT_VERSION, parseNarrateReply, type AiProvider, type NarrateReply } from '@budget/schema'
import { whyRefused } from '../ledger.js'
import type { SupabaseClient } from '../supabase.js'

/** SHA-256 of the text, as lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A signature of canonical text from savings-coach, under the prompt it was worded by. */
export function signatureOf(canonical: string): Promise<string> {
  return sha256Hex(`narrate-daily/v${NARRATE_PROMPT_VERSION}\n${canonical}`)
}

export interface Note {
  readonly scope: string
  readonly factsSig: string
  readonly body: NarrateReply
  /** Each card's, line's or goal line's signature, by its letter in this note. */
  readonly cardSigs: Readonly<Record<string, string>>
  /** Each letter's stable key in this note. */
  readonly factKeys: Readonly<Record<string, string>>
  readonly provider: AiProvider
}

export type NotesRead = { readonly ok: true; readonly notes: readonly Note[] } | { readonly ok: false; readonly why: 'needs_update' | 'unreachable' }

const strings = (v: unknown): Record<string, string> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'))
    : {}

/** The daily notes, newest first: at most 30 are kept (0017's trigger). */
export async function readNotes(supabase: SupabaseClient): Promise<NotesRead> {
  const { data, error } = await supabase
    .from('ai_notes')
    .select('scope, facts_sig, body, card_sigs, fact_keys, provider, created_at')
    .eq('surface', 'daily')
    .order('created_at', { ascending: false })
    .limit(30)
  if (error !== null) return { ok: false, why: whyRefused(error) }
  const notes = (data as readonly Record<string, unknown>[]).flatMap((row): Note[] => {
    const parsed = parseNarrateReply(row['body'])
    const provider = AiProviderSchema.safeParse(row['provider'])
    // A note whose words no longer pass the rule is not used, and not repaired.
    if (!parsed.ok || parsed.dropped.length > 0 || !provider.success) return []
    return [{
      scope: String(row['scope']),
      factsSig: String(row['facts_sig']),
      body: parsed.reply,
      cardSigs: strings(row['card_sigs']),
      factKeys: strings(row['fact_keys']),
      provider: provider.data,
    }]
  })
  return { ok: true, notes }
}

export interface NoteToWrite {
  readonly scope: string
  readonly factsSig: string
  readonly body: NarrateReply
  readonly cardSigs: Readonly<Record<string, string>>
  readonly factKeys: Readonly<Record<string, string>>
  readonly provider: AiProvider
  readonly model: string
}

/** Any number, in any script, or any currency or percent sign, anywhere in the body. */
export const FIGURE = /[\p{N}\p{Sc}%％]/u

/**
 * Keep checked words. `refused` when the body holds anything that could be
 * a figure, which checked words never do: it is not sent at all.
 */
export async function writeNote(supabase: SupabaseClient, userId: string, note: NoteToWrite): Promise<'kept' | 'refused' | 'needs_update' | 'unreachable'> {
  if (FIGURE.test(JSON.stringify(note.body))) return 'refused'
  const { error } = await supabase.from('ai_notes').upsert(
    {
      user_id: userId,
      surface: 'daily',
      scope: note.scope,
      facts_sig: note.factsSig,
      prompt_v: NARRATE_PROMPT_VERSION,
      body: note.body,
      card_sigs: note.cardSigs,
      fact_keys: note.factKeys,
      provider: note.provider,
      model: note.model,
    },
    { onConflict: 'user_id,surface,scope,facts_sig', ignoreDuplicates: true },
  )
  return error === null ? 'kept' : whyRefused(error)
}
