import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Thursday 24 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const pending = (id: string) => ({
  id, posted_on: '2026-09-20', amount_cents: -1349, merchant: 'SYNTHETIC CAFE', merchant_raw: 'SYNTHETIC CAFE', status: 'pending',
})

/**
 * Hand-derived. Records from 1 June; the statement ends 7 Sep, 17 days ago.
 * Dining out $300.00 on the 10th of June, July and August, and $600.00 by 24
 * Sep: $300.00 more than 1–24 Aug; usual month $300.00 over 3 months, MAD 0,
 * band max($25, $45, 0) × 24 ÷ 30 = $36.00, so big. Groceries $400.00 a month
 * and $400.00 by 24 Sep: the same. The month, $1,000.00 against $700.00:
 * $300.00 more. Two charges wait in Review.
 */
function seeded(name = 'Dining out'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('dining', name), cat('groceries', 'Groceries')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-08T12:00:00Z', period_start: '2026-06-01', period_end: '2026-09-07' }],
    ingest_candidates: [pending('p1'), pending('p2')],
    transactions: [
      ...['06', '07', '08'].flatMap((m) => [tx(`d${m}`, `2026-${m}-10`, -30_000, 'dining'), tx(`g${m}`, `2026-${m}-12`, -40_000, 'groceries')]),
      tx('d09', '2026-09-03', -60_000, 'dining'),
      tx('g09', '2026-09-12', -40_000, 'groceries'),
    ],
  })
}

/** The records with nothing to speak of: a fresh statement, nothing waiting, every month alike. */
function quiet(): FakeSupabase {
  const fake = seeded()
  fake.tables.ingest_candidates.length = 0
  Object.assign(fake.tables.ingest_batches[0]!, { period_end: '2026-09-20' })
  fake.tables.transactions.splice(fake.tables.transactions.findIndex((t) => t.id === 'd09'), 1, tx('d09', '2026-09-03', -30_000, 'dining'))
  return fake
}

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** An element whose whole text is `s`, however it is split into spans. */
const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s

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

describe('the Coach, in the app’s own words', () => {
  it('shows the day’s line, then stale data, Review and the biggest change, each with one action, with no AI, key or one-time update', async () => {
    go('/coach')
    renderScreen(<Shell />, seeded())

    expect(await screen.findByText(whole('P', 'You’ve spent $300.00 more than by this day last month. There’s still time to ease off.'))).toBeTruthy()
    expect(screen.getByText('In the app’s own words, from your records.')).toBeTruthy()
    const cards = within(screen.getByRole('region', { name: 'Insights' })).getAllByRole('listitem')
    expect(cards.map((c) => within(c).getByRole('heading').textContent)).toEqual([
      'Time for a fresh statement',
      'Charges waiting for you',
      'Dining out is running ahead',
    ])
    expect(within(cards[0]!).getByText(whole('P', 'Your last statement ends on 7 Sep, 17 days ago. Import the new one for fresh advice.'))).toBeTruthy()
    expect(within(cards[1]!).getByText(whole('P', 'Waiting in Review: 2. Each one counts as soon as you file it.'))).toBeTruthy()
    expect(within(cards[2]!).getByText(whole('P', 'You’ve spent $300.00 more on Dining out than by this day in August.'))).toBeTruthy()
    expect(within(cards[2]!).getByText('One thing to try: give it a lighter week, and the month evens out.')).toBeTruthy()
    expect(cards.map((c) => within(c).getAllByRole('button')[0]!.textContent)).toEqual(['Import a statement', 'Open Review', 'See the Month'])
    // ✕ waits for the table that keeps a dismissal (0016).
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  it('lists the engine’s figures behind a card in “Why am I seeing this?”', async () => {
    go('/coach')
    renderScreen(<Shell />, seeded())
    const card = (await screen.findByRole('heading', { name: 'Dining out is running ahead' })).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Why am I seeing this?' }))
    const rows = sheet.getAllByRole('term').map((t) => [t.textContent, t.nextElementSibling?.textContent])
    expect(rows).toEqual([
      ['So far this month', '$600.00'],
      ['Same days last month', '$300.00'],
      ['The difference', '$300.00 more'],
      ['Your usual month', '$300.00'],
      ['Compared with', 'August'],
      ['Complete months of records it rests on', '3'],
    ])
    expect(sheet.getByText('Worked out by the app from your own records. No AI was used.')).toBeTruthy()
    fireEvent.click(sheet.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens what a card’s action names', async () => {
    go('/coach')
    renderScreen(<Shell />, seeded())
    fireEvent.click(await screen.findByRole('button', { name: 'Import a statement' }))
    expect(window.location.hash).toBe('#/add')
  })

  it('says so when nothing needs attention, and that the month is steady', async () => {
    go('/coach')
    renderScreen(<Shell />, quiet())

    expect(await screen.findByText(/^Nothing needs your attention today\./)).toBeTruthy()
    expect(screen.getByText(whole('P', 'Your spending is about the same as by this day last month. Steady does it!'))).toBeTruthy()
  })

  it('draws a name that looks like markup as the characters it is', async () => {
    go('/coach')
    const { container } = renderScreen(<Shell />, seeded('<img src=x onerror=alert(1)>'))
    expect(await screen.findByRole('heading', { name: '<img src=x onerror=alert(1)> is running ahead' })).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
  })

  it('keeps the flight card when the records cannot be read, with one line for the cards', async () => {
    const fake = seeded()
    fake.tables.savings_goals.push({ id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: 1_265_000, target_date: null, unit_cost_cents: 27_500, unit_label: 'flight time' })
    fake.fail('ingest_batches', '42P01')
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('Your insights did not load. Reload to try again; everything else still works.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Flight training' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Insights' })).toBeNull()
  })
})
