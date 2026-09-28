import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The Coach's detector cards (plan A17, F38, F39): SPOTIFY's price went up
 * on 14 September, and COFFEE HOUSE charged $4.50 on the 21st and again on
 * the 23rd. Each shop is the statement's descriptor as statement-parsers
 * normalises it: "SPOTIFY 1234567" is SPOTIFY.
 */
const TODAY = new Date(2026, 8, 24, 12)
const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string, merchant_raw: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw, category_id, source: 'card_pdf',
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('music', 'Music', 'subscription'), cat('dining', 'Dining out', 'variable')],
    transactions: [
      ...['05', '06', '07', '08'].map((m) => tx(`s${m}`, `2026-${m}-14`, -1_199, 'music', 'SPOTIFY 1234567')),
      tx('s09', '2026-09-14', -1_299, 'music', 'SPOTIFY 7654321'),
      tx('k1', '2026-09-21', -450, 'dining', 'COFFEE HOUSE'),
      tx('k2', '2026-09-23', -450, 'dining', 'COFFEE HOUSE'),
    ],
  })
}

async function headings(): Promise<(string | null)[]> {
  const region = await screen.findByRole('region', { name: 'Insights' })
  return within(region).getAllByRole('heading').map((h) => h.textContent)
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/coach', 'Coach'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  // Today's automatic ask and the Reports tab are kept on the device; each test starts afresh.
  localStorage.clear()
  go('/coach')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Coach’s detector cards', () => {
  it('says a price went up and a charge came again, each with the figures behind it', async () => {
    renderScreen(<Shell />, seeded())
    expect(await headings()).toEqual(['A price went up: SPOTIFY', 'Charged again? COFFEE HOUSE'])
    const card = screen.getByRole('heading', { name: 'A price went up: SPOTIFY' }).closest('li')!
    expect(card.textContent).toContain('It now charges $12.99, up from $11.99. That comes to $155.88 a year.')
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))
    const why = await screen.findByRole('dialog')
    expect(within(why).getByText('The latest charge').nextSibling?.textContent).toBe('$12.99')
    expect(within(why).getByText('The charge before').nextSibling?.textContent).toBe('$11.99')
    expect(within(why).getByText('Next charge expected').nextSibling?.textContent).toBe('15 Oct')
    await expectNoAxeViolations()
  })

  it('opens Reports from a detector card', async () => {
    renderScreen(<Shell />, seeded())
    await headings()
    const card = screen.getByRole('heading', { name: 'Charged again? COFFEE HOUSE' }).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'See your shops' }))
    await waitFor(() => expect(window.location.hash).toBe('#/reports'))
    // Reports opens on Shops, where every subscription and flagged charge is listed.
    expect(localStorage.getItem('budget.reports.tab')).toBe('shops')
  })

  it('keeps a dismissed price rise gone by its cause, and never speaks of a shop marked not a subscription', async () => {
    const fake = seeded()
    renderScreen(<Shell />, fake)
    await headings()
    const card = screen.getByRole('heading', { name: 'A price went up: SPOTIFY' }).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'Dismiss this insight' }))
    await waitFor(() => expect(fake.tables.insight_dismissals.map((r) => r['insight_key'])).toEqual(['price_rise:SPOTIFY:2026-09-14']))

    cleanup()
    const marked = seeded()
    marked.tables.insight_dismissals.push({ user_id: 'u1', insight_key: 'not_subscription:SPOTIFY' })
    renderScreen(<Shell />, marked)
    expect(await headings()).toEqual(['Charged again? COFFEE HOUSE'])
  })

  it('sends "a shop" in the AI’s brief, never the name, when Share shop names is off', async () => {
    const fake = seeded()
    fake.tables.ai_settings.push({ user_id: 'u1', tone: 'cheerleader', share_shop_names: false })
    renderScreen(<Shell />, fake)
    await waitFor(() => expect(fake.functions.calls.some((c) => c['task'] === 'narrate')).toBe(true))
    const brief = fake.functions.calls.find((c) => c['task'] === 'narrate')!['data'] as { facts: { about: string }[] }
    expect(brief.facts.map((f) => f.about)).toEqual(expect.arrayContaining(['a shop']))
    expect(JSON.stringify(brief)).not.toContain('SPOTIFY')
    expect(JSON.stringify(brief)).not.toContain('COFFEE')
  })
})
