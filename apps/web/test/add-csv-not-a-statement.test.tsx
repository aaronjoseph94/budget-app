import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * e2e-money-10: an empty or heading-only file, and random bytes named
 * .csv, were offered the whole column-mapping card, with no columns to
 * pick or columns of noise, and a button to record 0 or 3 unreadable
 * rows. Each is said plainly instead. Counts of one are singular.
 */
function pick(file: File) {
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [file] } })
}

async function chosen(file: File) {
  renderScreen(<AddScreen />, createFakeSupabase())
  await screen.findByText('Choose a statement')
  pick(file)
}

const noMapping = () => {
  expect(screen.queryByText('What the file looks like')).toBeNull()
  expect(screen.queryByLabelText('Date column')).toBeNull()
  expect(screen.queryByRole('button', { name: /Record|Send/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Choose another' })).toBeTruthy()
}

describe('AddScreen, a file that is not a statement', () => {
  afterEach(cleanup)

  it.each([
    ['that is empty', ''],
    ['with only a heading', 'Date,Description,Amount\n'],
    ['with only blank lines', '\n\n\n'],
  ])('says a file %s has no transactions', async (_, text) => {
    await chosen(new File([text], 'statement.csv', { type: 'text/csv' }))
    expect(await screen.findByText('This file has no transactions')).toBeTruthy()
    noMapping()
  })

  it('says random bytes named .csv are not a text CSV', async () => {
    const bytes = new Uint8Array(Array.from({ length: 400 }, (_, i) => (i * 167 + 13) % 256))
    await chosen(new File([bytes], 'statement.csv', { type: 'text/csv' }))
    expect(await screen.findByText('This is not a text CSV')).toBeTruthy()
    noMapping()
  })

  it('counts one row, one line and one transaction in the singular', async () => {
    await chosen(new File(['Date,Description,Amount\n2026-09-20,CORNER MARKET,-45.10\n\n2026-09-23,BAD ROW,abc\n'], 'statement.csv', { type: 'text/csv' }))
    expect(await screen.findByText('2 rows read · 1 readable · 1 not · 1 blank line skipped')).toBeTruthy()
    expect(screen.getByText('1 row would not be imported')).toBeTruthy()
    expect(screen.getByText('1 transaction')).toBeTruthy()
  })
})
