import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Which column the CSV import starts on (architecture-c2-01). A card-number
 * column, the same on every row, was proposed as every row's shop when
 * masked, and as every row's amount when bare; a row whose shop has a
 * learned rule then went straight into the ledger. Invented shops.
 */
const CARD = (card: string) =>
  [
    'Transaction Date,Posted Date,Card No.,Description,Amount',
    `09/02/2026,09/03/2026,${card},CORNER MARKET,-42.10`,
    `09/13/2026,09/14/2026,${card},LITWARE BOOKS,-19.99`,
    `09/24/2026,09/25/2026,${card},CORNER MARKET,-8.00`,
  ].join('\n')

function pick(file: File) {
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [file] } })
}

async function send(csv: string) {
  const fake = createFakeSupabase()
  fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 3, deduped: 0, inserted: 3, rejected: 0, auto_approved: 0 }]
  renderScreen(<AddScreen />, fake)
  await screen.findByText('Choose a statement')
  pick(new File([csv], 'statement.csv', { type: 'text/csv' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Send 3 to the review queue' }))
  await screen.findByText(/waiting for review/)
  return (fake.rpcCalls[0]?.args.p_rows as readonly { merchant_raw: string; amount_cents: number }[]).map((r) => [r.merchant_raw, r.amount_cents])
}

describe('AddScreen, which CSV column is which', () => {
  afterEach(cleanup)

  const READ = [
    ['CORNER MARKET', -4_210],
    ['LITWARE BOOKS', -1_999],
    ['CORNER MARKET', -800],
  ]

  it('starts on the shops, not a masked card number the same on every row', async () => {
    expect(await send(CARD('****1234'))).toEqual(READ)
  })

  it('starts on the amounts, not a bare card number that reads as money', async () => {
    expect(await send(CARD('1234'))).toEqual(READ)
  })

  it('says so when more than one column looks like money', async () => {
    renderScreen(<AddScreen />, createFakeSupabase())
    await screen.findByText('Choose a statement')
    pick(new File(['Date,Description,Fee,Amount\n09/02/2026,CORNER MARKET,1.50,-42.10\n09/13/2026,LITWARE BOOKS,0.75,-19.99'], 's.csv', { type: 'text/csv' }))
    expect(await screen.findByText('More than one column looks like money.')).toBeTruthy()
  })
})
