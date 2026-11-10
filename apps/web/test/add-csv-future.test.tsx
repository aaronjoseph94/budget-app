import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Statement rows dated after today were offered with no word, while the
 * typed form refuses any such date. The usual cause is the wrong day and
 * month order: 3 December where the bank meant 12 March. Invented shops.
 */
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T12:00:00'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const EITHER_WAY = ['Date,Description,Amount', '03/12/2026,HARDWARE STORE,-40.00', '05/12/2026,GARDEN CENTRE,-25.50', '01/11/2026,CORNER MARKET,-3.00'].join('\n')

async function choose(csv: string) {
  renderScreen(<AddScreen />, createFakeSupabase())
  await screen.findByText('Choose a statement')
  const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
  fireEvent.change(input, { target: { files: [new File([csv], 'statement.csv', { type: 'text/csv' })] } })
  await screen.findByText('What the file looks like')
}

describe('AddScreen, statement rows dated after today', () => {
  it('says how many and the latest, above Send, and still lets them be sent', async () => {
    await choose(EITHER_WAY)
    fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'DD/MM/YYYY' } })
    expect(screen.getByText('2 rows are dated after today (latest: 5 Dec 2026). Check the date format.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
  })

  it('says nothing once every row is today or before', async () => {
    await choose(EITHER_WAY)
    fireEvent.change(screen.getByLabelText('Date format'), { target: { value: 'MM/DD/YYYY' } })
    expect(screen.queryByText(/dated after today/)).toBeNull()
  })

  it('speaks of one row in the singular', async () => {
    await choose(['Date,Description,Amount', '2026-11-10,CORNER MARKET,-3.00', '2026-11-09,LITWARE BOOKS,-4.00'].join('\n'))
    expect(screen.getByText('1 row is dated after today (10 Nov 2026). Check the date format.')).toBeTruthy()
  })
})
