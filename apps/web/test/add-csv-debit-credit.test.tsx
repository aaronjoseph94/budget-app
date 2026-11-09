import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { expectNoAxeViolations } from './axe.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Which way a CSV's money runs. Invented shops.
 *
 * A file with Debit and Credit columns was read through Debit alone as if
 * purchases were negative: purchases were sent as money in, and the row
 * under Credit was refused for having no amount. A file whose one column
 * writes purchases as positives was sent reversed with nothing said.
 */
const TWO_COLUMNS = [
  'Date,Description,Debit,Credit,Balance',
  '2026-10-01,CORNER MARKET,4.50,,995.50',
  '2026-10-02,LITWARE BOOKS,45.10,,950.40',
  '2026-10-03,PAYROLL,,2100.00,3050.40',
  '2026-10-04,FABRIKAM FUEL,3.00,,3047.40',
].join('\n')

const POSITIVE_PURCHASES = ['Date,Description,Amount', '2026-10-01,CORNER MARKET,4.50', '2026-10-02,LITWARE BOOKS,45.10', '2026-10-03,PAYMENT THANK YOU,-500.00'].join('\n')

const SIGN_HINT = /Most amounts here are positive/

async function choose(csv: string) {
  const fake = createFakeSupabase()
  fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 4, deduped: 0, inserted: 4, rejected: 0, auto_approved: 0 }]
  renderScreen(<AddScreen />, fake)
  await screen.findByText('Choose a statement')
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([csv], 'statement.csv', { type: 'text/csv' })] } })
  await screen.findByText('What the file looks like')
  return fake
}

const selected = (label: string) => {
  const select = screen.getByLabelText<HTMLSelectElement>(label)
  return select.selectedOptions[0]?.textContent
}

describe('AddScreen, a CSV with Debit and Credit columns', () => {
  afterEach(cleanup)

  it('sends purchases as money out and the credit as money in, every row read', async () => {
    const fake = await choose(TWO_COLUMNS)
    expect(selected('Money out column')).toMatch(/^Debit/)
    expect(selected('Money in column')).toMatch(/^Credit/)
    // The pair says which way each runs, so there is no sign to choose.
    expect(screen.queryByLabelText('How amounts are written')).toBeNull()
    expect(screen.queryByText(/would not be imported/)).toBeNull()
    await expectNoAxeViolations()

    fireEvent.click(screen.getByRole('button', { name: 'Send 4 to the review queue' }))
    await screen.findByText(/waiting for review/)
    const rows = fake.rpcCalls[0]?.args.p_rows as readonly { merchant_raw: string; amount_cents: number }[]
    expect(rows.map((r) => [r.merchant_raw, r.amount_cents])).toEqual([
      ['CORNER MARKET', -450],
      ['LITWARE BOOKS', -4_510],
      ['PAYROLL', 210_000],
      ['FABRIKAM FUEL', -300],
    ])
  })

  it('lets the owner go back to one amount column, where the sign is theirs to choose again', async () => {
    await choose(TWO_COLUMNS)
    fireEvent.change(screen.getByLabelText('Money in column'), { target: { value: '-1' } })
    expect(screen.getByLabelText('Amount column')).toBeTruthy()
    expect(screen.getByLabelText('How amounts are written')).toBeTruthy()
    expect(screen.getByText('1 row would not be imported')).toBeTruthy()
  })
})

describe('AddScreen, a CSV whose one amount column is mostly positive', () => {
  afterEach(cleanup)

  it('says to check which way purchases are written, until the owner chooses', async () => {
    await choose(POSITIVE_PURCHASES)
    expect(screen.getByText(SIGN_HINT)).toBeTruthy()
    expect(screen.queryByLabelText('Money in column')).toBeNull()
    fireEvent.change(screen.getByLabelText('How amounts are written'), { target: { value: 'debit_positive' } })
    expect(screen.queryByText(SIGN_HINT)).toBeNull()
    expect(screen.getByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
  })

  it('starts on "purchases are positive" for a column its header calls Debit', async () => {
    await choose(POSITIVE_PURCHASES.replace('Amount', 'Debit').replace('-500.00', '12.00'))
    expect(selected('How amounts are written')).toBe('Purchases are positive')
    expect(screen.queryByText(SIGN_HINT)).toBeNull()
  })

  it('says nothing for a file of mostly negatives', async () => {
    await choose(['Date,Description,Amount', '2026-10-01,CORNER MARKET,-4.50', '2026-10-02,LITWARE BOOKS,-45.10'].join('\n'))
    expect(selected('How amounts are written')).toBe('Purchases are negative')
    expect(screen.queryByText(SIGN_HINT)).toBeNull()
  })
})
