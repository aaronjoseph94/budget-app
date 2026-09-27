import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Add → Photo through the AI helper (plan A23), on the real screen and the
 * fake server. jsdom cannot decode or draw an image, so decoding succeeds
 * and the canvas hands back a few invented bytes, as a phone's would; the
 * rest, from the helper's reply to Review, is the app's own path. The shop
 * is invented.
 */
const READING = { readable: true, merchant: 'LITWARE CAFE', total: '14.23', date: '2026-09-20' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const real = {
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL,
  decode: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode'),
  getContext: HTMLCanvasElement.prototype.getContext,
  toBlob: HTMLCanvasElement.prototype.toBlob,
}
beforeEach(() => {
  URL.createObjectURL = () => 'blob:receipt'
  URL.revokeObjectURL = () => undefined
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: () => Promise.resolve() })
  HTMLCanvasElement.prototype.getContext = (() => ({ drawImage: () => undefined })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toBlob = function (done: BlobCallback) {
    done(new Blob([new Uint8Array(150).fill(65)], { type: 'image/jpeg' }))
  }
})
afterEach(() => {
  cleanup()
  URL.createObjectURL = real.create
  URL.revokeObjectURL = real.revoke
  if (real.decode === undefined) Reflect.deleteProperty(HTMLImageElement.prototype, 'decode')
  else Object.defineProperty(HTMLImageElement.prototype, 'decode', real.decode)
  HTMLCanvasElement.prototype.getContext = real.getContext
  HTMLCanvasElement.prototype.toBlob = real.toBlob
})

async function takePhoto(fake: FakeSupabase) {
  renderScreen(<AddScreen />, fake)
  fireEvent.click(await screen.findByRole('tab', { name: /Photo/ }))
  const input = screen.getByText('Take or choose a receipt photo').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File(['a photo'], 'receipt.jpg', { type: 'image/jpeg' })] } })
}

describe('AddScreen, a receipt photo read by the AI helper', () => {
  it('fills the form, names the service that read it, and still sends it to Review', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = () => json({ ok: true, provider: 'anthropic', model: 'claude-haiku-4-5', text: JSON.stringify(READING) })
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 1, deduped: 0, inserted: 1, rejected: 0, auto_approved: 0 }]
    await takePhoto(fake)

    expect(await screen.findByText(/Read by Anthropic/)).toBeTruthy()
    expect((screen.getByLabelText('Where') as HTMLInputElement).value).toBe('LITWARE CAFE')
    expect((screen.getByLabelText('Total spent') as HTMLInputElement).value).toBe('14.23')
    expect(fake.functions.calls).toEqual([{ action: 'run', task: 'receipt', data: { image: expect.stringMatching(/^QUFB/), mimeType: 'image/jpeg' } }])
    expect(fake.rpcCalls).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Send to review' }))
    expect(await screen.findByText('Sent to Review. Pick a category there and it counts.')).toBeTruthy()
    expect(fake.rpcCalls.map((c) => [c.name, c.args.p_source])).toEqual([['save_import', 'receipt_photo']])
    expect((fake.rpcCalls[0]?.args.p_rows as { amount_cents: number }[])[0]?.amount_cents).toBe(-1423)
  })

  it('with neither the helper nor read-receipt deployed, says so in one line pointing to One-time updates, and the receipt can be typed', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    fake.functions.readReceipt = null
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 1, deduped: 0, inserted: 1, rejected: 0, auto_approved: 0 }]
    await takePhoto(fake)

    expect(await screen.findByText(/Reading receipt photos needs the AI helper, which isn’t installed yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    fireEvent.change(screen.getByLabelText('Where'), { target: { value: 'FARMERS MARKET' } })
    fireEvent.change(screen.getByLabelText('Total spent'), { target: { value: '12.50' } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-09-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send to review' }))
    expect(await screen.findByText('Sent to Review. Pick a category there and it counts.')).toBeTruthy()
  })

  it('with AI off, sends the photo nowhere else and points to AI settings', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = () => json({ ok: false, code: 'ai_off' }, 409)
    fake.functions.readReceipt = () => json({ ok: true, reply: JSON.stringify(READING) })
    await takePhoto(fake)

    expect(await screen.findByText(/AI is off, so the photo was not read/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open AI settings' }).getAttribute('href')).toBe('#/ai')
    expect(fake.functions.receiptCalls).toEqual([])
  })
})
