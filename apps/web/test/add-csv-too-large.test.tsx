import { cleanup, fireEvent, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useCsvMapping } from '../src/csv-mapping.js'
import { AddScreen } from '../src/screens/AddScreen.js'
import { expectNoAxeViolations } from './axe.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * An amount too large to be a transaction is one unreadable row, never the
 * end of the screen. Choosing a column of 14-digit reference numbers as
 * the Amount, or a file with one absurd amount, made the preview's total
 * throw while drawing: "This screen did not load." Invented shops.
 */
const WITH_REFERENCES = [
  'Date,Description,Amount,Reference',
  '2026-10-01,CORNER MARKET,-3.50,20261001123450',
  '2026-10-02,LITWARE BOOKS,-4.50,20261002123451',
  '2026-10-03,FABRIKAM FUEL,-5.50,20261003123452',
].join('\n')

const ONE_ABSURD_AMOUNT = ['Date,Description,Amount', '2026-10-01,CORNER MARKET,-90071992547409.91', '2026-10-02,LITWARE BOOKS,-45.10'].join('\n')

const TOO_LARGE = 'This amount is too large to be a transaction.'

async function choose(csv: string) {
  renderScreen(<AddScreen />, createFakeSupabase())
  await screen.findByText('Choose a statement')
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([csv], 'statement.csv', { type: 'text/csv' })] } })
  await screen.findByText('What the file looks like')
}

describe('AddScreen, a CSV amount too large to be a transaction', () => {
  afterEach(cleanup)

  it('keeps drawing when a reference-number column is chosen as the Amount, and says why each row is refused', async () => {
    await choose(WITH_REFERENCES)
    expect(screen.getByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Amount column'), { target: { value: '3' } })

    expect(screen.getByText('3 rows would not be imported')).toBeTruthy()
    expect(screen.getAllByText(TOO_LARGE)).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Record 3 unreadable rows' })).toBeTruthy()
    expect(screen.getByText('3 rows read · 0 readable · 3 not · 0 blank lines skipped')).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('refuses the one absurd row and offers the rest', async () => {
    await choose(ONE_ABSURD_AMOUNT)
    expect(screen.getByText('1 row would not be imported')).toBeTruthy()
    expect(screen.getByText(TOO_LARGE)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send 1 to the review queue' })).toBeTruthy()
  })
})

describe('useCsvMapping, rows that add up past what the app can count', () => {
  afterEach(cleanup)

  it('takes its totals from the summary that says too large rather than throwing', () => {
    // 90,073 rows at the limit would prove it end to end, too slowly for a
    // screen test: core's import-summary.test.ts holds summariseImportWithin.
    const { result } = renderHook(() => useCsvMapping('Date,Description,Amount\n2026-10-01,CORNER MARKET,-999999999.99'))
    expect(result.current.summary).toEqual({ count: 1, netCents: -99_999_999_999, inflowCents: 0, outflowCents: -99_999_999_999 })
  })
})
