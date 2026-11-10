import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * "Send 3 to the review queue" stayed under "3 waiting for review" once it
 * had worked, and a second tap sent the file again. Once sent, Go to review
 * takes its place, as on the PDF and Photo paths. Invented shops.
 */
const CSV = ['Date,Description,Amount', '2026-10-01,CORNER MARKET,-4.50', '2026-10-02,LITWARE BOOKS,-45.10', '2026-10-03,FABRIKAM FUEL,-3.00'].join('\n')

describe('AddScreen, a CSV once sent', () => {
  afterEach(cleanup)

  it('offers Go to review instead of a second Send, so one tap is one save', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 3, deduped: 0, inserted: 3, rejected: 0, auto_approved: 0 }]
    renderScreen(<AddScreen />, fake)
    await screen.findByText('Choose a statement')
    const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
    fireEvent.change(input, { target: { files: [new File([CSV], 'statement.csv', { type: 'text/csv' })] } })

    fireEvent.click(await screen.findByRole('button', { name: 'Send 3 to the review queue' }))
    await screen.findByText(/waiting for review/)
    expect(screen.queryByRole('button', { name: 'Send 3 to the review queue' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Go to review' }))
    expect(fake.rpcCalls.filter((c) => c.name === 'save_import')).toHaveLength(1)
    expect(window.location.hash).toBe('#/review')
  })

  it('offers Send again once a setting changes what would be read', async () => {
    const fake = createFakeSupabase()
    fake.rpcReplies.save_import = [{ batch_id: 'b1', parsed: 3, deduped: 0, inserted: 3, rejected: 0, auto_approved: 0 }]
    renderScreen(<AddScreen />, fake)
    await screen.findByText('Choose a statement')
    const input = screen.getByText('Choose a statement').closest('label')!.querySelector('input')!
    fireEvent.change(input, { target: { files: [new File([CSV], 'statement.csv', { type: 'text/csv' })] } })
    fireEvent.click(await screen.findByRole('button', { name: 'Send 3 to the review queue' }))
    await screen.findByText(/waiting for review/)

    fireEvent.change(screen.getByLabelText('How amounts are written'), { target: { value: 'debit_positive' } })
    expect(screen.getByRole('button', { name: 'Send 3 to the review queue' })).toBeTruthy()
  })
})
