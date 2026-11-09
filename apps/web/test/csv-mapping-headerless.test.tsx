import { act, cleanup, fireEvent, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { detectHeaderRow, tokenizeCsv, US_AMOUNT_FORMAT } from '@budget/statement-parsers'
import { useCsvMapping } from '../src/csv-mapping.js'
import { AddScreen } from '../src/screens/AddScreen.js'
import { expectNoAxeViolations } from './axe.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * An export with no heading row keeps its first charge. Invented shops.
 *
 * detectHeaderRow answers 'header', 'data' or 'ambiguous', and on
 * 'ambiguous' "the importer must ask". The import read 'ambiguous' as "the
 * first record is a header", so a headerless file whose last line is a
 * closing line, or that is one record long, lost its first charge: taken
 * as column names, in neither the accepted nor the rejected rows, and not
 * in `parsed`, so the counts balanced and nothing said a row was gone.
 *
 * The rule held: when the file cannot settle it and the first record
 * holds a date or an amount, as a charge does, the preview asks and reads
 * nothing until the owner answers. A first record with neither is no
 * charge under either reading, so it stays a heading, unasked.
 */
const HEADERLESS_WITH_CLOSING_LINE = [
  '09/02/2026,CORNER MARKET,-42.10',
  '09/13/2026,LITWARE BOOKS,-19.99',
  '09/24/2026,CORNER MARKET,-8.00',
  ',END OF STATEMENT,',
].join('\n')

const ONE_CHARGE = '09/22/2026,CORNER MARKET,-42.10'

const HEADED_WITH_CLOSING_LINE = `Date,Description,Amount\n${HEADERLESS_WITH_CLOSING_LINE}`

describe('useCsvMapping on an export with no header row', () => {
  afterEach(cleanup)

  it('the parser itself says it cannot tell, as documented', () => {
    const rows = tokenizeCsv(HEADERLESS_WITH_CLOSING_LINE, { delimiter: ',' })
    expect(rows.ok && detectHeaderRow(rows.rows, US_AMOUNT_FORMAT)).toBe('ambiguous')
  })

  it('reads nothing until the owner says what the first row is', () => {
    const { result } = renderHook(() => useCsvMapping(HEADERLESS_WITH_CLOSING_LINE))
    expect(result.current.askHeader).toBe(true)
    expect(result.current.result).toBeNull()
    expect(result.current.summary).toBeNull()
  })

  it('accounts for every record once told the first row is a transaction', () => {
    const { result } = renderHook(() => useCsvMapping(HEADERLESS_WITH_CLOSING_LINE))
    act(() => result.current.choose('hasHeader', false))
    const read = result.current.result
    expect(read?.parsed).toBe(4)
    expect(read?.accepted.map((r) => [r.postedOn, r.merchantRaw, r.amountCents])).toEqual([
      ['2026-09-02', 'CORNER MARKET', -4_210],
      ['2026-09-13', 'LITWARE BOOKS', -1_999],
      ['2026-09-24', 'CORNER MARKET', -800],
    ])
    expect(read?.rejected.map((r) => r.line)).toEqual([4])
  })

  it('reads a one-line export as one charge once told so, not as a header with nothing under it', () => {
    const { result } = renderHook(() => useCsvMapping(ONE_CHARGE))
    expect(result.current.result).toBeNull()
    act(() => result.current.choose('hasHeader', false))
    expect(result.current.result?.parsed).toBe(1)
    expect(result.current.result?.accepted.map((r) => r.amountCents)).toEqual([-4_210])
  })

  it('takes the first row as column names when the owner says so', () => {
    const { result } = renderHook(() => useCsvMapping(HEADERLESS_WITH_CLOSING_LINE))
    act(() => result.current.choose('hasHeader', true))
    expect(result.current.result?.parsed).toBe(3)
  })

  it('does not ask when the first row holds no date and no amount: it is a heading', () => {
    const { result } = renderHook(() => useCsvMapping(HEADED_WITH_CLOSING_LINE))
    expect(result.current.askHeader).toBe(false)
    expect(result.current.result?.parsed).toBe(4)
    expect(result.current.result?.accepted).toHaveLength(3)
  })
})

describe('AddScreen, a CSV with no heading row', () => {
  afterEach(cleanup)

  it('asks what the first row is, sends nothing meanwhile, then reads the first charge', async () => {
    renderScreen(<AddScreen />, createFakeSupabase())
    await screen.findByText('Choose a statement')
    const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
    fireEvent.change(input, { target: { files: [new File([HEADERLESS_WITH_CLOSING_LINE], 'statement.csv', { type: 'text/csv' })] } })

    expect(await screen.findByText('Is the first row column names?')).toBeTruthy()
    await expectNoAxeViolations()
    expect(screen.queryByRole('button', { name: /review queue/ })).toBeNull()

    fireEvent.change(screen.getByLabelText('First row'), { target: { value: 'data' } })

    expect(await screen.findByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
    expect(screen.getByText('2 Sep 2026')).toBeTruthy()
    expect(screen.getByText('1 row would not be imported')).toBeTruthy()
    expect(screen.queryByText('Is the first row column names?')).toBeNull()
  })
})
