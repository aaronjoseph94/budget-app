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
