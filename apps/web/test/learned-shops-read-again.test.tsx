import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LearnedShopsCard } from '../src/screens/LearnedShops.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Settings → "Shops filed by themselves": a read that fails
 * sets the card's error, and a later read that succeeds never clears it
 * (LearnedShops.tsx: the effect's `.then` sets the shops and leaves `error`
 * as it was). So after one failed read, say opened with no signal, the card
 * goes on saying the shops "could not be read just now. Try again." above
 * the shops it has just read, once the connection is back and the app has
 * read everything again by itself.
 */
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => cleanup())

describe('learned shops, read again after a failed read', () => {
  it('stops saying the shops could not be read once they have been', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
      merchant_rules: [{ id: 'm1', match_merchant: 'CONTOSO MARKET', category_id: 'food' }],
    })
    // The first read of the learned shops alone is refused; the app's own first load is not.
    let refuse = true
    fake.server.refuse = (table) => (table === 'merchant_rules' && refuse ? '57014' : null)
    renderScreen(<LearnedShopsCard />, fake)
    expect(await screen.findByText(/The shops the app has learned could not be read just now/)).toBeTruthy()

    // The server answers again, and the app reads everything again, as it does when the network comes back.
    refuse = false
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await pause(300)
    })

    // The shops are on screen now …
    const list = await screen.findByRole('list', { name: 'Learned shops' })
    expect(within(list).getByText('CONTOSO MARKET')).toBeTruthy()
    // … so nothing should still say they could not be read.
    expect(screen.queryByText(/could not be read just now/)).toBeNull()
  })
})
