import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cents } from '@budget/money-primitives'
import { isoDate } from '@budget/core'
import { AppDataProvider } from '../src/app-data.js'
import { AddScreen } from '../src/screens/AddScreen.js'
import type { PdfImport } from '../src/pdf-import.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Add → Statement, while an import is being saved: its answer ("2 waiting
 * for review") is the screen's one outcome line, so another file chosen
 * meanwhile would wear it and read as imported when it was not. Choose
 * another waits for the save instead, as Import does.
 *
 * The fake answers an RPC at once, so this client holds save_import's
 * answer until released, as photo-send-then-next.test.tsx does.
 */
const read = vi.hoisted(() => ({ result: null as PdfImport | null }))
vi.mock('../src/pdf-import.js', () => ({ readStatementFile: async () => read.result }))

const row = (line: number, merchantRaw: string, amount: number) => ({
  line, postedOn: isoDate('2026-09-03'), amountCents: cents(amount), merchantRaw, issuerTransactionId: undefined,
})
const STATEMENT: PdfImport = {
  ok: true,
  period: { from: isoDate('2026-08-10'), to: isoDate('2026-09-09') },
  parsed: 2,
  accepted: [row(1, 'CORNER MARKET', -4210), row(2, 'LITWARE BOOKS', -1999)],
  rejected: [],
  reconciliation: { balances: true, discrepancies: [], parsedPurchasesCents: cents(6209), parsedPaymentsCents: cents(0), rowCount: 2 },
}

afterEach(() => {
  cleanup()
  read.result = null
})

describe('a statement being saved', () => {
  it('keeps Choose another waiting until the save has answered', async () => {
    read.result = STATEMENT
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 2, deduped: 0, inserted: 2, rejected: 0, auto_approved: 0 }]
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    const client = createClient('http://fake.supabase.test', 'fake-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'statement-save-then-next' },
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
    const picker = (await screen.findByText('Choose a statement')).closest('label')!.querySelector('input')!
    fireEvent.change(picker, { target: { files: [new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 transactions' }))
    await waitFor(() => expect(fake.rpcCalls.filter((c) => c.name === 'save_import')).toHaveLength(1))

    // Its answer is not back: another file cannot take this one's place yet.
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Choose another' }).disabled).toBe(true)

    release()
    expect(await screen.findByText('2 waiting for review.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Choose another' }).disabled).toBe(false)
  })
})
