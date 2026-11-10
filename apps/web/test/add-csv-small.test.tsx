import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/** Three small things the CSV preview said wrong. Invented shops. */
async function choose(csv: string) {
  renderScreen(<AddScreen />, createFakeSupabase())
  await screen.findByText('Choose a statement')
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([csv], 'statement.csv', { type: 'text/csv' })] } })
  await screen.findByText('What the file looks like')
}

const options = (label: string) => [...screen.getByLabelText<HTMLSelectElement>(label).options].map((o) => o.textContent)

describe('AddScreen, a CSV heading with a blank cell', () => {
  afterEach(cleanup)

  // "Date,Description,Amount," named its fourth column "", a blank choice.
  it('names the unnamed column by its place, as a file with no heading row does', async () => {
    await choose(['Date,Description,Amount,', '2026-10-01,CORNER MARKET,-4.50,', '2026-10-02,LITWARE BOOKS,-45.10,'].join('\n'))
    expect(options('Amount column')[3]).toBe('Column 4')
  })
})

describe('AddScreen, a description too long to keep', () => {
  afterEach(cleanup)

  // It was refused as having characters that could show as something else.
  it('says it is too long, not that its characters are wrong', async () => {
    await choose(['Date,Description,Amount', `2026-10-01,${'CORNER MARKET '.repeat(37)},-4.50`, '2026-10-02,LITWARE BOOKS,-45.10'].join('\n'))
    expect(screen.getByText('The description is longer than 512 characters.')).toBeTruthy()
    expect(screen.queryByText(/could show as something other/)).toBeNull()
  })
})

describe('AddScreen, a CSV with no description column', () => {
  afterEach(cleanup)

  // "Date,Amount" was proposed with Amount as the description too, so
  // "-4.50" became the shop name of every row.
  it('proposes no description, says one is needed, and reads nothing until one is chosen', async () => {
    await choose(['Date,Amount', '2026-10-01,-4.50', '2026-10-02,-45.10'].join('\n'))
    expect(screen.getByLabelText<HTMLSelectElement>('Description column').value).toBe('')
    expect(screen.getByText('No column reads as a description.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /review queue|unreadable/ })).toBeNull()
    expect(screen.queryByText('-4.50')).toBeNull()

    fireEvent.change(screen.getByLabelText('Description column'), { target: { value: '1' } })
    expect(screen.getByRole('button', { name: 'Send 2 to the review queue' })).toBeTruthy()
  })
})
