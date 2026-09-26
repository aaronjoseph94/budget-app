import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupScreen } from '../src/screens/SetupScreen.js'
import { renderScreen } from './render-screen.js'
import { SHOPS_TODAY, shopsFake } from './shops-seed.js'

/**
 * Setup's "Looks like a monthly bill: add it?" (plan A17, F38): SPOTIFY
 * charges Music, on Subscriptions, every month, and Music has no monthly
 * amount. The nudge fills the bill editor; only Save writes.
 */
const music = async () => within(await screen.findByRole('region', { name: 'Subscriptions' }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(SHOPS_TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Setup’s monthly bill nudge', () => {
  it('fills the day and amount from the charges, and writes only when saved', async () => {
    const fake = shopsFake()
    // Every write of a monthly amount, so one made on Fill it in would be counted too.
    let writes = 0
    fake.server.hold = (target) => {
      if (target === 'POST category_plans') writes += 1
      return null
    }
    renderScreen(<SetupScreen />, fake)
    const card = await music()
    expect(await card.findByText('Looks like a monthly bill: add it?')).toBeTruthy()
    expect(card.getByText(/SPOTIFY charged/).textContent).toBe('SPOTIFY charged $12.99 each month, lately on day 14.')

    fireEvent.click(card.getByRole('button', { name: 'Fill it in for Music' }))
    expect((card.getByRole('textbox', { name: 'Day paid for Music' }) as HTMLInputElement).value).toBe('14')
    expect((card.getByRole('textbox', { name: /Monthly amount for Music/ }) as HTMLInputElement).value).toBe('12.99')
    expect(fake.tables.category_plans).toEqual([])

    fireEvent.click(card.getByRole('button', { name: 'Save Music’s monthly amount' }))
    await waitFor(() => expect(fake.tables.category_plans).toMatchObject([{ category_id: 'music', effective_month: '2026-09-01', planned_cents: 1_299, due_day: 14 }]))
    await waitFor(() => expect(card.queryByText('Looks like a monthly bill: add it?')).toBeNull())
    expect(writes).toBe(1)
  })

  it('offers nothing for a shop marked not a subscription, or a category with an amount', async () => {
    // RADIO, on a second subscription, still gets its nudge: so the charges were read.
    const withRadio = () => {
      const fake = shopsFake()
      fake.tables.categories.push({ id: 'radio', name: 'Radio', kind: 'subscription', sort_order: 5, weekly_budget_cents: null })
      for (const m of ['07', '08', '09']) {
        fake.tables.transactions.push({ id: `r${m}`, posted_on: `2026-${m}-03`, amount_cents: -900, merchant_raw: 'RADIO', category_id: 'radio', source: 'card_csv' })
      }
      return fake
    }
    const marked = withRadio()
    marked.tables.insight_dismissals.push({ user_id: 'u1', insight_key: 'not_subscription:SPOTIFY' })
    renderScreen(<SetupScreen />, marked)
    expect(await (await music()).findByText(/RADIO charged/)).toBeTruthy()
    expect(screen.queryByText(/SPOTIFY charged/)).toBeNull()
    cleanup()

    const planned = withRadio()
    planned.tables.category_plans.push({ id: 'p1', category_id: 'music', effective_month: '2026-01-01', planned_cents: 1_299, due_day: 14 })
    renderScreen(<SetupScreen />, planned)
    expect(await (await music()).findByText(/RADIO charged/)).toBeTruthy()
    expect(screen.queryByText(/SPOTIFY charged/)).toBeNull()
  })

  it('still offers it on a row whose monthly amount was stopped', async () => {
    const fake = shopsFake()
    fake.tables.category_plans.push({ id: 'p1', category_id: 'music', effective_month: '2026-01-01', planned_cents: null, due_day: null })
    renderScreen(<SetupScreen />, fake)
    expect(await (await music()).findByText(/SPOTIFY charged/)).toBeTruthy()
  })

  it('leaves Setup working, with no nudge, when the charges cannot be read', async () => {
    const fake = shopsFake()
    fake.fail('transactions', '08006')
    renderScreen(<SetupScreen />, fake)
    const card = await music()
    expect(await card.findByRole('textbox', { name: 'Day paid for Music' })).toBeTruthy()
    expect(screen.queryByText('Looks like a monthly bill: add it?')).toBeNull()
  })
})
