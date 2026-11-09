import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { GettingStartedScreen } from '../src/screens/GettingStartedScreen.js'
import { NO_MARKS } from '../src/profile.js'
import { aiStatusReply, createFakeSupabase } from './fake-supabase.js'

/**
 * Getting started, step "This month's starting balance":
 * pressing Save with the balance already stored (unchanged, or the same
 * amount typed another way) leaves the editor on "Saving…" with its field
 * disabled for good. The save itself succeeded.
 */

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('Getting started, starting balance saved a second time', () => {
  it('lets the balance be saved again and edited afterwards', async () => {
    const fake = createFakeSupabase({
      // user_id as the app writes it, so the fake's upsert finds the stored row as 0010's key does.
      month_balances: [{ id: 'm1', user_id: 'u1', month: '2026-09-01', starting_balance_cents: 240_000 }],
    })
    fake.functions.aiStatus = aiStatusReply({ enabled: false })
    await fake.signIn()
    render(
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" displayName="Alex" setupMarks={NO_MARKS}>
        <GettingStartedScreen />
      </AppDataProvider>,
    )
    fireEvent.click(await screen.findByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /This month’s starting balance/ }))

    const field = await screen.findByRole<HTMLInputElement>('textbox', { name: 'Starting bank balance for September' })
    expect(field.value).toBe('2400.00')
    // The same amount, typed as a person would: nothing about what is stored changes.
    fireEvent.change(field, { target: { value: '2400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // The save is confirmed and stored …
    expect(await screen.findByText('September started at $2,400.00.')).toBeTruthy()
    expect(fake.tables.month_balances.map((b) => b.starting_balance_cents)).toEqual([240_000])

    // … and the editor must come back: the field usable, the button "Save" again.
    await waitFor(
      () => {
        expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Starting bank balance for September' }).disabled).toBe(false)
        expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull()
      },
      { timeout: 3000 },
    )
  })
})
