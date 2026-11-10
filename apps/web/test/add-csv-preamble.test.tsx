import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * A bank export with lines above its table could not be imported: the
 * first line was taken as the column names and every transaction was
 * refused for its column count. Invented shops.
 */
const WITH_PREAMBLE = [
  'Account: Main Card ****1234',
  'Statement period: 1 Oct 2026 - 31 Oct 2026',
  '',
  'Date,Description,Amount',
  '2026-10-01,CORNER MARKET,-4.50',
  '2026-10-02,LITWARE BOOKS,-45.10',
  '2026-10-03,FABRIKAM FUEL,-3.00',
].join('\n')

async function choose(csv: string) {
  renderScreen(<AddScreen />, createFakeSupabase())
  await screen.findByText('Choose a statement')
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([csv], 'statement.csv', { type: 'text/csv' })] } })
  await screen.findByText('What the file looks like')
}

const selected = (label: string) => screen.getByLabelText<HTMLSelectElement>(label).selectedOptions[0]?.textContent

describe('AddScreen, a CSV with lines above its table', () => {
  afterEach(cleanup)

  it('reads the table under them, says they were skipped, and counts no row for them', async () => {
    await choose(WITH_PREAMBLE)
    expect(screen.getByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
    expect(selected('Description column')).toMatch(/^Description/)
    expect(screen.queryByText(/would not be imported/)).toBeNull()
    expect(screen.getByText('3 rows read · 3 readable · 0 not · 1 blank line skipped')).toBeTruthy()
    expect(screen.getByText('2 lines above the table were skipped.')).toBeTruthy()
  })

  it('says nothing of skipped lines when there were none', async () => {
    await choose(WITH_PREAMBLE.split('\n').slice(3).join('\n'))
    expect(screen.queryByText(/above the table/)).toBeNull()
  })
})
