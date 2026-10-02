import { describe, expect, it, vi } from 'vitest'
import type { ReceiptPhoto } from '@budget/schema'
import { readReceiptPhoto } from '../src/receipt.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A receipt photo's reading (plan A23): the AI helper first, and
 * read-receipt when the helper is not there to answer, so a photo works as
 * it did before the helper was pasted. Either reply goes through the one
 * receipt zod. The photo is a few invented bytes; the shop is invented.
 */
const PHOTO: ReceiptPhoto = { image: 'QUJD'.repeat(40), mimeType: 'image/jpeg' }
const READING = { readable: true, merchant: 'LITWARE CAFE', total: '14.23', date: '2026-09-20' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const helperSays = (code: string, status: number) => () => json({ ok: false, code }, status)

function setUp(helper: ((body: Readonly<Record<string, unknown>>) => Response) | null, reader: (() => Response | Promise<Response>) | null = () => json({ ok: true, reply: JSON.stringify(READING) })) {
  const fake = createFakeSupabase()
  fake.functions.ai = helper
  fake.functions.readReceipt = reader
  return fake
}

describe('reading a receipt photo', () => {
  it('asks the AI helper with the photo alone, reads its reply with the receipt zod, and names the service', async () => {
    const fake = setUp(() => json({ ok: true, provider: 'anthropic', model: 'claude-haiku-4-5', text: JSON.stringify(READING) }))
    expect(await readReceiptPhoto(fake.client, PHOTO)).toEqual({ ok: true, reading: { merchant: 'LITWARE CAFE', total: '14.23', date: '2026-09-20' }, by: 'Anthropic' })
    expect(fake.functions.calls).toEqual([{ action: 'run', task: 'receipt', data: PHOTO }])
    expect(fake.functions.receiptCalls).toEqual([])
  })

  it('falls back to read-receipt, exactly as before, when the helper is not deployed', async () => {
    const fake = setUp(null)
    expect(await readReceiptPhoto(fake.client, PHOTO)).toEqual({ ok: true, reading: { merchant: 'LITWARE CAFE', total: '14.23', date: '2026-09-20' }, by: 'Gemini' })
    expect(fake.functions.receiptCalls).toEqual([PHOTO])
  })

  it('says AI is off when read-receipt finds the switch off behind an older helper (architecture-c2-04)', async () => {
    const fake = setUp(helperSays('needs_update', 503), () => json({ ok: false, code: 'ai_off' }, 409))
    expect(await readReceiptPhoto(fake.client, PHOTO)).toEqual({
      ok: false,
      message: 'AI is off in AI settings, so the photo was not read. Type it in below.',
      link: null,
    })
  })

  it('falls back when the helper needs its one-time update', async () => {
    const fake = setUp(helperSays('needs_update', 503))
    expect((await readReceiptPhoto(fake.client, PHOTO)).ok).toBe(true)
    expect(fake.functions.receiptCalls).toEqual([PHOTO])
  })

  it('sends the photo nowhere else when the helper failed before it could read the owner’s settings (backend-b-01)', async () => {
    // helper_error and bad_request can both come before the helper has read
    // whether AI is off, as can a gateway 5xx with no code at all.
    const replies = [helperSays('helper_error', 503), helperSays('bad_request', 400), () => new Response('upstream timed out', { status: 504 })]
    for (const reply of replies) {
      const fake = setUp(reply)
      const read = await readReceiptPhoto(fake.client, PHOTO)
      expect(read.ok).toBe(false)
      expect(fake.functions.receiptCalls).toEqual([])
    }
  })

  it('says in one line that nothing is installed, pointing to One-time updates, when neither reader is deployed', async () => {
    const fake = setUp(null, null)
    expect(await readReceiptPhoto(fake.client, PHOTO)).toEqual({
      ok: false,
      message: 'Reading receipt photos needs a one-time update, so the photo was not read. Type it in below meanwhile.',
      link: 'updates',
    })
  })

  it('says a one-time update is needed, not that the helper is missing, when the helper waits for 0016 and read-receipt is not deployed', async () => {
    const fake = setUp(helperSays('needs_update', 503), null)
    expect(await readReceiptPhoto(fake.client, PHOTO)).toEqual({
      ok: false,
      message: 'Reading receipt photos needs a one-time update, so the photo was not read. Type it in below meanwhile.',
      link: 'updates',
    })
    expect(fake.functions.receiptCalls).toEqual([PHOTO])
  })

  it('waits for read-receipt past its 10 s sign-in check plus its 30 s wait for Gemini, then gives up (review-r-02)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const fake = setUp(null, () => new Promise<Response>(() => undefined))
      let settled = false
      const pending = readReceiptPhoto(fake.client, PHOTO).finally(() => void (settled = true))
      // 40 s is read-receipt's own worst case: the app must still be waiting for its 504, with room to spare.
      await vi.advanceTimersByTimeAsync(49_000)
      expect(settled).toBe(false)
      await vi.advanceTimersByTimeAsync(1_000)
      expect((await pending).ok).toBe(false)
      expect(fake.functions.receiptCalls).toEqual([PHOTO])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps read-receipt’s own reasons when it is the one that answered', async () => {
    const fake = setUp(null, () => json({ ok: false, code: 'rate_limited' }, 429))
    expect(await readReceiptPhoto(fake.client, PHOTO)).toMatchObject({ ok: false, message: expect.stringContaining('Wait a minute') })
  })

  it('never goes around the owner’s AI settings: off, not set up, resting or a key turned down stay with the helper', async () => {
    const cases = [
      ['ai_off', 409, 'ai'],
      ['not_set_up', 409, 'ai'],
      ['limit_reached', 429, 'ai-rests'],
      ['all_resting', 503, 'ai-rests'],
      ['all_failed', 502, 'ai-rests'],
      ['key_rejected', 409, 'ai'],
    ] as const
    for (const [code, status, link] of cases) {
      const fake = setUp(helperSays(code, status))
      expect(await readReceiptPhoto(fake.client, PHOTO), code).toMatchObject({ ok: false, link })
      expect(fake.functions.receiptCalls, code).toEqual([])
    }
  })

  it('uses nothing the receipt zod refuses, and says why', async () => {
    const fake = setUp(() => json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ ...READING, total: 14.23 }) }))
    expect(await readReceiptPhoto(fake.client, PHOTO)).toMatchObject({ ok: false, message: expect.stringContaining('cannot trust') })
    const blurry = setUp(() => json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ ...READING, readable: false }) }))
    expect(await readReceiptPhoto(blurry.client, PHOTO)).toMatchObject({ ok: false, message: expect.stringContaining('closer, flatter photo') })
    expect([...fake.functions.receiptCalls, ...blurry.functions.receiptCalls]).toEqual([])
  })
})
