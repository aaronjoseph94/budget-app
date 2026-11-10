import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * What Review says after an approval is true of the row approved, and
 * Approve these N keeps the keyboard's place: its question takes focus,
 * and Cancel gives it back.
 */
const LEARNS = /will be filed the same way automatically/

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [{ id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
    ingest_candidates: [
      { id: 'p1', posted_on: '2026-03-09', amount_cents: -1349, merchant: 'CORNER MARKET', merchant_raw: 'CORNER MARKET #12', status: 'pending' },
      { id: 'p2', posted_on: '2026-03-12', amount_cents: -1250, merchant: 'Lunch at Subway', merchant_raw: 'Lunch at Subway', status: 'pending' },
    ],
  })
}

async function row(merchantRaw: string) {
  const item = (await screen.findByText(merchantRaw)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no row for ${merchantRaw}`)
  return within(item)
}

async function pick(merchantRaw: string) {
  fireEvent.change((await row(merchantRaw)).getByRole('combobox', { name: 'Category' }), { target: { value: 'c1' } })
}

afterEach(() => {
  cleanup()
  window.location.hash = ''
})

describe('what Review says after approving', () => {
  it('promises the shop files itself for a statement row, as it will', async () => {
    renderScreen(<ReviewScreen />, seeded())
    await pick('CORNER MARKET #12')
    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))
    expect(await screen.findByText(LEARNS)).toBeTruthy()
  })

  it('says the same after Approve these N, which files each shop the same way', async () => {
    renderScreen(<ReviewScreen />, seeded())
    await pick('CORNER MARKET #12')
    await pick('Lunch at Subway')
    fireEvent.click(await screen.findByRole('button', { name: 'Approve these 2' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Approve all 2' }))
    expect(await screen.findByText(/Filed 2\./)).toBeTruthy()
    expect(screen.getByText(LEARNS)).toBeTruthy()
  })
})

describe('Approve these N and the keyboard', () => {
  it('moves focus to its question when opened, and back to its button on Cancel', async () => {
    renderScreen(<ReviewScreen />, seeded())
    await pick('CORNER MARKET #12')
    await pick('Lunch at Subway')
    const open = await screen.findByRole('button', { name: 'Approve these 2' })
    open.focus()
    fireEvent.click(open)
    const question = await screen.findByRole('group', { name: 'Approve these 2?' })
    await waitFor(() => expect(question.contains(document.activeElement)).toBe(true))

    fireEvent.click(within(question).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Approve these 2' })))
  })
})
