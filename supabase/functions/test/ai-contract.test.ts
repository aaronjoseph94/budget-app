import { describe, expect, expectTypeOf, it } from 'vitest'
import { AI_KEY_SHAPE, AiProviderSchema, type AiRequest } from '@budget/schema'
import { RequestSchema } from '../ai/index.js'

/**
 * The helper parses its requests with its own zod, since it is pasted as
 * one file; the app sends packages/schema's AiRequest. tsc holds the two
 * types equal, and each request the app can send is taken here.
 */
describe('the helper and the app agree on what may be asked', () => {
  it('takes exactly the requests packages/schema names', () => {
    // The app's type is readonly throughout; zod's output is not, which is no difference on the wire.
    expectTypeOf<Readonly<ReturnType<typeof RequestSchema.parse>>>().toEqualTypeOf<AiRequest>()
    const sent: readonly AiRequest[] = [
      { action: 'ping' },
      { action: 'status' },
      { action: 'save_key', provider: 'gemini', key: 'test-not-a-real-key-0001' },
      { action: 'test_key', provider: 'gemini' },
    ]
    for (const body of sent) expect(RequestSchema.safeParse(body).success).toBe(true)
    expect(RequestSchema.options.map((o) => o.shape.action.value)).toEqual(sent.map((b) => b.action))
  })

  it('takes a key of exactly the shape the app checks before sending', () => {
    for (const key of ['test-not-a-real-key-0001', 'a'.repeat(20), 'a'.repeat(200), 'x'.repeat(19), 'a'.repeat(201), 'test not a real key 0001', 'test-not-a-real-key-000/']) {
      const helper = RequestSchema.safeParse({ action: 'save_key', provider: 'gemini', key }).success
      expect([key, helper]).toEqual([key, AI_KEY_SHAPE.test(key)])
    }
  })

  it('knows the same services as the database', () => {
    expect(AiProviderSchema.options).toEqual(['gemini', 'groq', 'openrouter', 'openai', 'anthropic'])
  })
})
