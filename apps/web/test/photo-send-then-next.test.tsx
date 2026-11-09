import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Add → Photo: "Send to review" is pressed for one receipt
 * and, before the save has answered (a phone on a slow connection), "Use
 * another photo" is pressed and the next receipt chosen. When the first
 * save answers, its "Sent to Review" and its lock land on the SECOND
 * receipt's form: the fields go read-only, Send to review disappears, and
 * the screen says it was sent. It was not: one save was made, for the first
 * receipt only. The second receipt is lost unless the owner starts again.
 *
 * The fake server answers RPCs at once and has no way to hold one, so this
 * test's client sends through the fake's own fetch with a gate on
 * save_import. Nothing else about the server differs.
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const FIRST = { readable: true, merchant: 'LITWARE CAFE', total: '14.23', date: '2026-09-20' }
const SECOND = { readable: true, merchant: 'CONTOSO MARKET', total: '55.10', date: '2026-09-21' }

const real = {
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL,
  decode: Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode'),
  getContext: HTMLCanvasElement.prototype.getContext,
  toBlob: HTMLCanvasElement.prototype.toBlob,
}
// jsdom cannot decode or draw an image: as test/add-photo-ai.test.tsx stands in for it.
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

const choosePhoto = (name: string) => {
  const input = screen.getByText('Take or choose a receipt photo').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([name], name, { type: 'image/jpeg' })] } })
}

describe('a second receipt chosen while the first is still being sent', () => {
  it('leaves the second receipt unsent and sendable, never marked as sent', async () => {
    const fake = createFakeSupabase()
    const readings = [FIRST, SECOND]
    fake.functions.ai = (body) =>
      body['action'] === 'run'
        ? json({ ok: true, provider: 'gemini', model: 'gemini-flash', text: JSON.stringify(readings.shift()) })
        : json({ ok: true, version: 'x' })
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 1, deduped: 0, inserted: 1, rejected: 0, auto_approved: 0 }]

    // The fake server, with save_import's answer held until released.
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    const client = createClient('http://fake.supabase.test', 'fake-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'photo-send-then-next' },
      global: {
        fetch: async (input, init) => {
          const reply = await fake.fetch(input, init)
          if (String(input).endsWith('/rest/v1/rpc/save_import')) await held
          return reply
        },
      },
    })
    render(
      <AppDataProvider supabase={client} userId="u1" email="you@example.com">
        <AddScreen />
      </AppDataProvider>,
    )
    fireEvent.click(await screen.findByRole('tab', { name: /Photo/ }))

    // Receipt one: read, checked, sent.
    choosePhoto('one.jpg')
    await screen.findByText(/Read by Gemini/)
    expect(screen.getByLabelText<HTMLInputElement>('Where').value).toBe('LITWARE CAFE')
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Total spent').value).toBe('14.23'))
    fireEvent.click(screen.getByRole('button', { name: 'Send to review' }))
    await waitFor(() => expect(fake.rpcCalls.filter((c) => c.name === 'save_import')).toHaveLength(1))

    // Its answer has not come back. On to receipt two.
    fireEvent.click(screen.getByRole('button', { name: 'Use another photo' }))
    choosePhoto('two.jpg')
    await waitFor(() => expect(screen.getByLabelText<HTMLInputElement>('Where').value).toBe('CONTOSO MARKET'))
    expect(screen.getByLabelText<HTMLInputElement>('Total spent').value).toBe('55.10')

    // Now the first save answers.
    release()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sending…' })).toBeNull())
    await new Promise((resolve) => setTimeout(resolve, 200))

    // Only the first receipt was ever sent …
    const sent = fake.rpcCalls.filter((c) => c.name === 'save_import')
    expect(sent).toHaveLength(1)
    expect((sent[0]?.args.p_rows as { merchant_raw: string }[])[0]?.merchant_raw).toBe('LITWARE CAFE')
    // … so the second, still on screen, must not read as sent, and must still be sendable.
    expect(screen.getByLabelText<HTMLInputElement>('Where').value).toBe('CONTOSO MARKET')
    expect({
      saysSent: screen.queryByText('Sent to Review. Pick a category there and it counts.') !== null,
      fieldsLocked: screen.getByLabelText<HTMLInputElement>('Where').readOnly,
      canStillSend: screen.queryByRole('button', { name: 'Send to review' }) !== null,
    }).toEqual({ saysSent: false, fieldsLocked: false, canStillSend: true })
  })
})
