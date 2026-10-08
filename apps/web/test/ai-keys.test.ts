import { describe, expect, it } from 'vitest'
import type { AiKeyReply } from '@budget/schema'
import { saveKey, speedTest } from '../src/ai/keys.js'
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
  return { result: await saveKey(fake.client, 'gemini', pasted), sent: fake.functions.calls }
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

  it('sends a key for the service it was pasted for, and names that service when it is turned down', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = reply(keyReply({ provider: 'groq', source: 'none', status: 'rejected', hint: null, models: [] }))
    const result = await saveKey(fake.client, 'groq', KEY)
    expect(fake.functions.calls).toEqual([{ action: 'save_key', provider: 'groq', key: KEY }])
    expect(result.sentence).toBe('Groq says this key isn’t valid: check you copied all of it')
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

/**
 * Test, the speed test (ADR 0015): one real call on the one service
 * named, timed by the helper, said in tenths of a second with the service
 * and the model that answered, its vendor prefix and :free dropped.
 */
describe('Test', () => {
  const ran = (ms: unknown, model = 'thinkingmachines/inkling-small:free') => reply({ ok: true, provider: 'openrouter', model, text: '{"ok":true}', ms })

  async function testWith(answer: () => Response) {
    const fake = createFakeSupabase()
    fake.functions.ai = answer
    return { result: await speedTest(fake.client, 'openrouter'), sent: fake.functions.calls }
  }

  it('asks the helper to run its test on that service alone, and says how long it took', async () => {
    const { result, sent } = await testWith(ran(1234))
    expect(sent).toEqual([{ action: 'run', task: 'test', provider: 'openrouter' }])
    expect(result).toEqual({ sentence: 'Last test: 1.2 s on OpenRouter · inkling-small', good: true, help: null, models: null })
  })

  it('writes tenths of a second plainly, and the model without its vendor or :free', async () => {
    expect((await testWith(ran(950))).result.sentence).toBe('Last test: 1.0 s on OpenRouter · inkling-small')
    expect((await testWith(ran(0))).result.sentence).toBe('Last test: 0.0 s on OpenRouter · inkling-small')
    expect((await testWith(ran(20_000, 'google/gemma-4-26b-a4b-it:free'))).result.sentence).toBe('Last test: 20.0 s on OpenRouter · gemma-4-26b-a4b-it')
    expect((await testWith(ran(640, 'openrouter/free'))).result.sentence).toBe('Last test: 0.6 s on OpenRouter · free')
  })

  it('says in a few words why there is no time, naming the service', async () => {
    const cases: [string, number, string][] = [
      ['all_failed', 502, 'OpenRouter didn’t answer. Try again.'],
      ['all_resting', 503, 'OpenRouter is resting. Try later.'],
      ['limit_reached', 429, 'Daily limit reached. Try tomorrow.'],
      ['ai_off', 409, 'Turn on Use AI first.'],
      ['not_set_up', 409, 'Needs a key, or paid services on.'],
      ['key_rejected', 409, 'OpenRouter turned down the key. Paste it again.'],
    ]
    for (const [code, status, sentence] of cases) {
      const { result } = await testWith(reply({ ok: false, code }, status))
      expect([code, result.sentence, result.good, result.help, result.models]).toEqual([code, sentence, false, null, null])
    }
  })

  it('passes on the helper’s state when it could not run, with where to go next', async () => {
    const { result } = await testWith(reply({ ok: false, code: 'needs_update' }, 503))
    expect(result).toEqual({ sentence: 'AI needs a one-time update. Everything else works. One-time updates shows which.', good: false, help: 'updates', models: null })
  })

  it('reads a reply with no time, as an older helper writes one, as the helper’s trouble', async () => {
    for (const odd of [ran(undefined), ran('fast'), reply({ ok: true })]) {
      const { result } = await testWith(odd)
      expect([result.good, result.help]).toEqual([false, 'codes'])
    }
  })
})
