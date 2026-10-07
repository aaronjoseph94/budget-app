import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * ✕ on the Coach's cards (plan §2.3, A12): a dismissal is kept by its
 * cause in 0017's insight_dismissals, so the same cause stays gone on
 * every device and a new one comes back. Without 0017, ✕ is not offered.
 * The records are coach-cards': stale data (statements end 7 Sep), two
 * rows in Review, and Dining out's rise this month.
 */
const TODAY = new Date(2026, 8, 24, 12)
const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const pending = (id: string) => ({ id, posted_on: '2026-09-20', amount_cents: -1349, merchant: 'SYNTHETIC CAFE', merchant_raw: 'SYNTHETIC CAFE', status: 'pending' })

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('dining', 'Dining out'), cat('groceries', 'Groceries')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-08T12:00:00Z', period_start: '2026-06-01', period_end: '2026-09-07' }],
    ingest_candidates: [pending('p1'), pending('p2')],
    transactions: [
      ...['06', '07', '08'].flatMap((m) => [tx(`d${m}`, `2026-${m}-10`, -30_000, 'dining'), tx(`g${m}`, `2026-${m}-12`, -40_000, 'groceries')]),
      tx('d09', '2026-09-03', -60_000, 'dining'),
      tx('g09', '2026-09-12', -40_000, 'groceries'),
    ],
  })
}

/** Each card's heading, once the cards are drawn. */
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
  go('/coach')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('dismissing an insight', () => {
  it('keeps the cause, so the card stays gone here and on every other device', async () => {
    const fake = seeded()
    renderScreen(<Shell />, fake)
    expect(await headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
    const dining = screen.getByRole('heading', { name: 'Running ahead: Dining out' }).closest('li')!
    fireEvent.click(within(dining).getByRole('button', { name: 'Dismiss this insight' }))

    await waitFor(() => expect(fake.tables.insight_dismissals).toEqual([{ id: expect.any(String) as string, user_id: 'u1', insight_key: 'category_change:dining:2026-09-01:up' }]))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Running ahead: Dining out' })).toBeNull())
    cleanup()
    renderScreen(<Shell />, fake)
    expect(await headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you'])
    await expectNoAxeViolations()
  })

  // e2e-setup-06: ✕ went with its card, and focus fell to <body>.
  it('keeps focus on the insights: the next card’s ✕, else the one before', async () => {
    renderScreen(<Shell />, seeded())
    expect(await headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
    const dismiss = (title: string) => within(screen.getByRole('heading', { name: title }).closest('li')!).getByRole('button', { name: 'Dismiss this insight' })
    const press = (button: HTMLElement) => {
      act(() => button.focus())
      fireEvent.click(button)
    }

    press(dismiss('Charges waiting for you'))
    await waitFor(() => expect(document.activeElement).toBe(dismiss('Running ahead: Dining out')))
    press(dismiss('Running ahead: Dining out'))
    await waitFor(() => expect(document.activeElement).toBe(dismiss('Time for a fresh statement')))
  })

  it('brings back a new cause for the same thing', async () => {
    const fake = seeded()
    // Dismissed when the statements ended on 1 Sep; they now end on 7 Sep, which is news.
    fake.tables.insight_dismissals.push({ user_id: 'u1', insight_key: 'stale_data:2026-09-01' }, { user_id: 'u1', insight_key: 'rows_waiting:2026-09-24' })
    renderScreen(<Shell />, fake)
    expect(await headings()).toEqual(['Time for a fresh statement', 'Running ahead: Dining out'])
  })

  it('is not offered without 0017, and every card still shows', async () => {
    const fake = seeded()
    fake.fail('insight_dismissals', 'PGRST205')
    renderScreen(<Shell />, fake)
    expect(await headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
    expect(screen.queryByRole('button', { name: 'Dismiss this insight' })).toBeNull()
  })
})
