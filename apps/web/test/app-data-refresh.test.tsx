import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAppData, type AppData } from '../src/app-data.js'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

afterEach(cleanup)

const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })

/** Hands the test the provider's own refresh, so it can await the one it started. */
function Probe({ into }: { into: { current: AppData | null } }) {
  into.current = useAppData()
  return null
}

describe('AppData refresh, answered out of order (CR-1)', () => {
  it('keeps the newer read when an older one arrives after it', async () => {
    const fake = createFakeSupabase({ categories: [cat('c1', 'Groceries'), cat('c2', 'Restaurants')] })
    const data: { current: AppData | null } = { current: null }
    renderScreen(<><SettingsScreen /><Probe into={data} /></>, fake)
    const restaurants = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Weekly budget for Restaurants' })

    // An older refresh reads categories while the budget is still unset, and
    // its answer is held until a newer one, begun after the save, has shown.
    let release = () => {}
    const late = new Promise<void>((resolve) => (release = resolve))
    let asked = false
    fake.server.hold = (table) => {
      if (table !== 'categories' || asked) return null
      asked = true
      return late
    }
    const older = data.current?.refresh()
    await waitFor(() => expect(asked).toBe(true))

    fireEvent.change(restaurants, { target: { value: '200' } })
    fireEvent.blur(restaurants)
    await waitFor(() => expect(data.current?.categories.find((c) => c.id === 'c2')?.weekly_budget_cents).toBe(20000))
    expect(restaurants.value).toBe('200.00')

    release()
    await act(async () => {
      await older
    })
    expect(data.current?.categories.find((c) => c.id === 'c2')?.weekly_budget_cents).toBe(20000)
    expect(restaurants.value).toBe('200.00')
  })
})
