import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * A CSV whose every day is 12 or lower could be either way round. The
 * screen asked the owner to choose but read and saved it as MM/DD/YYYY
 * meanwhile, so 3 April became 4 March (architecture-b-02).
 */
const DD_MM = ['Date,Description,Amount', '03/04/2026,CORNER MARKET,-42.10', '05/04/2026,LITWARE BOOKS,-19.99', '11/04/2026,CORNER MARKET,-8.00'].join('\n')

describe('AddScreen, a CSV whose dates could be either way round', () => {
  afterEach(cleanup)

  it('reads and sends nothing until the owner says which way round, then reads it their way', async () => {
    renderScreen(<AddScreen />, createFakeSupabase())
    await screen.findByText('Choose a statement')
    const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
    fireEvent.change(input, { target: { files: [new File([DD_MM], 'statement.csv', { type: 'text/csv' })] } })

    expect(await screen.findByText('Which way round are these dates?')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /review queue/ })).toBeNull()
    expect(screen.queryByText('4 Mar 2026')).toBeNull()

    fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'DD/MM/YYYY' } })

    expect(await screen.findByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
    expect(screen.getByText('3 Apr 2026')).toBeTruthy()
    expect(screen.queryByText('Which way round are these dates?')).toBeNull()
  })
})
