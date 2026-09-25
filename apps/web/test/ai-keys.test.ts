import { describe, expect, it } from 'vitest'
import type { AiKeyReply } from '@budget/schema'
import { saveGeminiKey } from '../src/ai/keys.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The app's side of Save & test (plan §8.3, A10): what is sent, and the
 * sentence each answer becomes. The key is obviously not a real one.
 */

const KEY = 'test-not-a-real-key-0001'
const reply = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const MODELS = [{ id: 'gemini-3.5-flash-lite', listed: true }]
const keyReply = (over: Partial<AiKeyReply> = {}): AiKeyReply => ({
  ok: true, provider: 'gemini', source: 'saved', status: 'ok', hint: '0001', models: MODELS, ...over,
})

async function saveWith(answer: () => Response, pasted = KEY) {
  const fake = createFakeSupabase()
  fake.functions.ai = answer
  return { result: await saveGeminiKey(fake.client, pasted), sent: fake.functions.calls }
}

describe('Save & test', () => {
  it('sends the key without the spaces around it, and says it works with its last four characters', async () => {
    const { result, sent } = await saveWith(reply(keyReply()), `\n ${KEY}  `)
    expect(sent).toEqual([{ action: 'save_key', provider: 'gemini', key: KEY }])
    expect(result).toEqual({ sentence: 'Works · key ending …0001', good: true, help: null, models: MODELS })
  })

  it('says what each test found, in the words of plan §8.3', async () => {
    const cases: [Partial<AiKeyReply>, string][] = [
      [{ source: 'none', status: 'rejected', hint: null, models: [] }, 'Google says this key isn’t valid: check you copied all of it'],
      [{ status: 'busy', models: [] }, 'Busy right now: saved, and it will be tried again'],
      [{ status: 'locked', models: [] }, 'Your saved key can’t be opened after a Supabase key change: paste it again'],
      [{ source: 'secret', hint: '0002' }, 'Works · your receipts key ending …0002'],
    ]
    for (const [over, sentence] of cases) {
      const { result } = await saveWith(reply(keyReply(over)))
      expect(result.sentence).toBe(sentence)
      // Models to choose from only when the key works.
      expect(result.models === null).toBe(over.status !== undefined)
    }
  })

  it('sends nothing that is not a whole key', async () => {
    for (const pasted of ['', 'AIza-half', `${KEY} ${KEY}`, 'test-not-a-real-key/0001']) {
      const { result, sent } = await saveWith(reply(keyReply()), pasted)
      expect(sent).toEqual([])
      expect(result).toEqual({ sentence: 'That doesn’t look like a whole key: check you copied all of it', good: false, help: null, models: null })
    }
  })

  it('passes on the helper’s state when it could not test, with where to go next', async () => {
    const { result } = await saveWith(reply({ ok: false, code: 'needs_update' }, 503))
    expect(result).toEqual({
      sentence: 'AI needs a one-time update. Everything else works. One-time updates shows which.', good: false, help: 'updates', models: null,
    })
  })

  it('reads an answer that is not a key reply as the helper’s trouble, never as a result', async () => {
    for (const odd of [{ ok: true }, keyReply({ status: 'fine' as never }), { ...keyReply(), models: [{ id: 1 }] }, { ...keyReply(), hint: 4 }]) {
      const { result } = await saveWith(reply(odd))
      expect([result.good, result.help]).toEqual([false, 'codes'])
    }
  })
})
