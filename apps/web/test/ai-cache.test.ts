import { describe, expect, it } from 'vitest'
import type { NarrateReply } from '@budget/schema'
import { readNotes, sha256Hex, signatureOf, writeNote, type NoteToWrite } from '../src/coach/ai-cache.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The AI's kept words (0017's ai_notes, ADR 0005 §6): signatures made with
 * WebCrypto, words read back through the same rule, and no figure ever
 * sent to be stored.
 */
const BODY: NarrateReply = {
  summary: 'You’ve spent {{A.change}} than by this day last month.',
  cards: [{ fact: 'B', title: 'Running ahead: {{B.name}}', body: 'Up on last month.', tryThis: 'One thing to try: a lighter week.' }],
  goal: null,
  quote: { id: 'small-leak', why: 'Little charges add up.' },
}
const SIG = 'a'.repeat(64)
const NOTE: NoteToWrite = {
  scope: 'day:2026-09-24', factsSig: SIG, body: BODY, cardSigs: { A: 'b'.repeat(64) }, factKeys: { A: 'summary:month', B: 'cat:c1:change' },
  provider: 'gemini', model: 'gemini-3.5-flash-lite',
}
const stored = (over: Record<string, unknown> = {}) => ({
  user_id: 'u1', surface: 'daily', scope: 'day:2026-09-24', facts_sig: SIG, prompt_v: 1, body: BODY, card_sigs: {}, fact_keys: {},
  provider: 'gemini', model: 'gemini-3.5-flash-lite', created_at: '2026-09-24T12:00:00Z', ...over,
})

describe('signatures', () => {
  it('are SHA-256, with the prompt’s version in every one', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await signatureOf('abc')).toBe(await sha256Hex('narrate-daily/v1\nabc'))
  })
})

describe('writeNote', () => {
  it('keeps checked words, with the prompt’s version and nothing that could be a figure', async () => {
    const fake = createFakeSupabase()
    expect(await writeNote(fake.client, 'u1', NOTE)).toBe('kept')
    expect(fake.tables.ai_notes).toEqual([{
      id: expect.any(String) as string, user_id: 'u1', surface: 'daily', scope: 'day:2026-09-24', facts_sig: SIG, prompt_v: 1, body: BODY,
      card_sigs: NOTE.cardSigs, fact_keys: NOTE.factKeys, provider: 'gemini', model: 'gemini-3.5-flash-lite',
    }])
    expect(JSON.stringify(fake.tables.ai_notes[0]?.['body'])).not.toMatch(/[\p{N}\p{Sc}%]/u)
  })

  it('never sends a digit, in any script, or a currency or percent sign, to be stored', async () => {
    const fake = createFakeSupabase()
    for (const bad of ['You spent $412.', 'Since 2026.', 'Up ２ weeks.', 'Up ٣ weeks.', 'Up ५ weeks.', 'Spent ＄.', 'Ten %.', 'In €.', 'About ½.']) {
      expect(await writeNote(fake.client, 'u1', { ...NOTE, body: { ...BODY, summary: bad } }), bad).toBe('refused')
      expect(await writeNote(fake.client, 'u1', { ...NOTE, body: { ...BODY, quote: { id: 'small-leak', why: bad } } }), bad).toBe('refused')
    }
    expect(fake.tables.ai_notes).toEqual([])
  })

  it('says when 0017 is not in, or the write did not arrive', async () => {
    const fake = createFakeSupabase()
    fake.fail('ai_notes', 'PGRST205')
    expect(await writeNote(fake.client, 'u1', NOTE)).toBe('needs_update')
    fake.fail('ai_notes', '08006')
    expect(await writeNote(fake.client, 'u1', NOTE)).toBe('unreachable')
  })
})

describe('readNotes', () => {
  it('reads the daily notes newest first, holding each to the rule again', async () => {
    const fake = createFakeSupabase({
      ai_notes: [
        stored({ scope: 'day:2026-09-23', created_at: '2026-09-23T12:00:00Z', card_sigs: { A: 'c'.repeat(64) }, fact_keys: { A: 'summary:week' } }),
        stored(),
        // Words that break the rule, however they got there, are passed over, not repaired.
        stored({ scope: 'day:2026-09-22', created_at: '2026-09-22T12:00:00Z', body: { ...BODY, summary: 'You spent forty more.' } }),
        stored({ scope: 'day:2026-09-21', created_at: '2026-09-21T12:00:00Z', provider: 'someone' }),
        stored({ surface: 'report', scope: 'month:2026-08' }),
      ],
    })
    const read = await readNotes(fake.client)
    expect(read.ok && read.notes.map((n) => [n.scope, n.factsSig, n.provider])).toEqual([
      ['day:2026-09-24', SIG, 'gemini'],
      ['day:2026-09-23', SIG, 'gemini'],
    ])
    expect(read.ok && read.notes[1]).toMatchObject({ body: BODY, cardSigs: { A: 'c'.repeat(64) }, factKeys: { A: 'summary:week' } })
  })

  it('says when 0017 is not in, and when the read failed for another reason', async () => {
    const fake = createFakeSupabase()
    fake.fail('ai_notes', '42P01')
    expect(await readNotes(fake.client)).toEqual({ ok: false, why: 'needs_update' })
    fake.fail('ai_notes', 'PGRST301')
    expect(await readNotes(fake.client)).toEqual({ ok: false, why: 'unreachable' })
  })
})
