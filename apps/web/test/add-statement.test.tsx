import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cents } from '@budget/money-primitives'
import { isoDate } from '@budget/core'
import { AddScreen } from '../src/screens/AddScreen.js'
import type { PdfImport } from '../src/pdf-import.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * A PDF statement on Add, from the reader's answer on. The reader and the
 * reconciliation have their own tests in statement-parsers and core, over
 * built PDFs; here the answer is handed in, so these test what the screen
 * does with it: above all, that a statement which does not add up can never
 * be imported (CR-6).
 */
const read = vi.hoisted(() => ({ result: null as PdfImport | null }))
vi.mock('../src/pdf-import.js', () => ({
  readStatementPdf: async () => {
    if (read.result === null) throw new Error('no reading set for this test')
    return read.result
  },
}))

const row = (line: number, merchantRaw: string, amount: number) => ({
  line, postedOn: isoDate('2026-09-03'), amountCents: cents(amount), merchantRaw, issuerTransactionId: undefined,
})

function statement(balances: boolean): PdfImport {
  return {
    ok: true,
    period: { from: isoDate('2026-08-10'), to: isoDate('2026-09-09') },
    parsed: 2,
    accepted: [row(1, 'CORNER MARKET', -4210), row(2, 'LITWARE BOOKS', -1999)],
    rejected: [],
    reconciliation: {
      balances,
      discrepancies: balances
        ? []
        : [{ what: 'purchases_and_debits', statementCents: cents(7209), parsedCents: cents(6209), differenceCents: cents(-1000) }],
      parsedPurchasesCents: cents(6209),
      parsedPaymentsCents: cents(0),
      rowCount: 2,
    },
  }
}

async function choose() {
  const picker = (await screen.findByText('Choose a statement')).closest('label')!.querySelector('input')!
  fireEvent.change(picker, { target: { files: [new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' })] } })
}

afterEach(() => {
  cleanup()
  read.result = null
})

describe('AddScreen, a PDF statement', () => {
  it('imports nothing from a statement that does not add up, and says which figure is off', async () => {
    read.result = statement(false)
    const fake = createFakeSupabase()
    renderScreen(<AddScreen />, fake)
    await choose()

    expect(await screen.findByText('Nothing will be imported from this file')).toBeTruthy()
    expect(screen.getByText('Purchases: statement says $72.09, read $62.09')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Import/ })).toBeNull()
    expect(fake.rpcCalls).toEqual([])
  })

  it('imports one that adds up, and says where each row went', async () => {
    read.result = statement(true)
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 2, deduped: 1, inserted: 1, rejected: 0, auto_approved: 0 }]
    renderScreen(<AddScreen />, fake)
    await choose()

    fireEvent.click(await screen.findByRole('button', { name: 'Import 2 transactions' }))
    expect(await screen.findByText('1 waiting for review, 1 you already had.')).toBeTruthy()
    expect(fake.rpcCalls.map((c) => [c.name, c.args.p_source, c.args.p_parsed])).toEqual([['save_import', 'card_pdf', 2]])
  })

  it('says the reader could not read it, and offers another', async () => {
    read.result = { ok: false, title: 'This PDF is password-protected', detail: 'Download an unprotected copy.' }
    renderScreen(<AddScreen />, createFakeSupabase())
    await choose()

    expect(await screen.findByText('This PDF is password-protected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Choose another' }))
    await waitFor(() => expect(screen.getByText('Choose a statement')).toBeTruthy())
  })
})
