import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { SHOPS_TODAY, shopsFake } from './shops-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/** Reports → Shops (plan §2.6, A17): every figure core's (F38, F39, F41), from shops-seed's invented records. */

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const card = async (title: string) => (await screen.findByRole('heading', { name: title })).closest('div.rounded-xl') as HTMLElement
const openShops = async () => fireEvent.click(await screen.findByRole('tab', { name: 'Shops' }))

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(SHOPS_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
  window.location.hash = ''
})

describe('Reports, Shops: top shops', () => {
  it('ranks the shops against the same days of last month, and names the new ones', async () => {
    go('/reports')
    renderScreen(<Shell />, shopsFake())
    await openShops()

    const top = await card('Top shops')
    expect(within(top).getByText(/^1 – 24 Sep, against 1 – 24 Aug/)).toBeTruthy()
    const rows = within(top).getAllByRole('listitem')
    expect(rows.map((li) => li.textContent)).toEqual([
      'FURNITURE CO1 charge · $450.00 more than August$450.00',
      'CAFE4 charges · $155.00 more than August$255.00',
      'GYM1 charge · about the same as August$45.00',
      'SPOTIFY1 charge · $1.00 more than August$12.99',
      'COFFEE HOUSE2 charges · $9.00 more than August$9.00',
      'TEA1 charge · $6.25 more than August$6.25',
      'TEA ROOM1 charge · $6.25 more than August$6.25',
    ])
    const fresh = within(top).getAllByRole('term').map((dt) => dt.textContent)
    expect(fresh).toEqual(['FURNITURE CO', 'COFFEE HOUSE', 'TEA', 'TEA ROOM'])
    // The tab is kept on this device, and the month still steps.
    expect(localStorage.getItem('budget.reports.tab')).toBe('shops')
    expect(screen.getByRole('navigation', { name: 'Month' }).classList.contains('hidden')).toBe(false)
  })

  it('says there is nothing to compare with before the records, and that it is too early to call a shop new', async () => {
    const fake = shopsFake()
    fake.tables.ingest_batches.splice(0, 1, { ...fake.tables.ingest_batches[0]!, period_start: '2026-08-08' })
    go('/reports')
    renderScreen(<Shell />, fake)
    await openShops()
    const top = await card('Top shops')
    expect(within(top).getByText('Your records start on 8 Aug, so there is no last month to set these against yet.')).toBeTruthy()
    expect(within(top).getByText(/^Too early to tell/)).toBeTruthy()
    expect(within(top).getAllByRole('listitem')[0]!.textContent).toBe('FURNITURE CO1 charge$450.00')
  })

  it('opens on Shops from the Coach’s card, and says in one line when Reports need a one-time update', async () => {
    const fake = shopsFake()
    fake.fail('transactions', '42P01')
    localStorage.setItem('budget.reports.tab', 'shops')
    go('/reports')
    renderScreen(<Shell />, fake)
    expect(await screen.findByText('Reports need a one-time update.', { exact: false })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Shops' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
  })
})

describe('Reports, Shops: subscriptions', () => {
  it('lists each regular charge with how often, its next date, a year of it and a price change', async () => {
    go('/reports')
    renderScreen(<Shell />, shopsFake())
    await openShops()
    const subs = await card('Subscriptions and regular charges')
    const [gym, spotify] = within(subs).getAllByRole('listitem')
    expect(within(gym!).getByText('New')).toBeTruthy()
    expect(gym!.textContent).toContain('Monthly · next about 21 Oct · $540.00 a year')
    expect(spotify!.textContent).toContain('Monthly · next about 15 Oct · $155.88 a year')
    expect(spotify!.textContent).toContain('Price went up from $11.99 to $12.99')
  })

  it('marks one as not a subscription, kept on every device, and it is never called one again', async () => {
    const fake = shopsFake()
    go('/reports')
    renderScreen(<Shell />, fake)
    await openShops()
    const subs = await card('Subscriptions and regular charges')
    fireEvent.click(within(subs).getByRole('button', { name: 'Not a subscription: SPOTIFY' }))
    await waitFor(() => expect(fake.tables.insight_dismissals.map((r) => r['insight_key'])).toEqual(['not_subscription:SPOTIFY']))
    await waitFor(() => expect(within(subs).queryByText('SPOTIFY')).toBeNull())
    expect(within(subs).getByText('GYM')).toBeTruthy()
  })

  it('says in one line that marking needs a one-time update without 0017, and still lists every charge', async () => {
    const fake = shopsFake()
    fake.fail('insight_dismissals', 'PGRST205')
    go('/reports')
    renderScreen(<Shell />, fake)
    await openShops()
    const subs = await card('Subscriptions and regular charges')
    expect(await within(subs).findByText('Marking one as not a subscription needs a one-time update.', { exact: false })).toBeTruthy()
    expect(within(subs).getAllByRole('listitem')).toHaveLength(2)
    expect(within(subs).queryByRole('button', { name: /Not a subscription/ })).toBeNull()
    expect(within(subs).getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
  })
})

describe('Reports, Shops: worth a second look', () => {
  it('points out each flagged charge, and hides none', async () => {
    const fake = shopsFake()
    // Dismissed on the Coach: still listed here, since a possible double is flagged, never hidden.
    fake.tables.insight_dismissals.push({ user_id: 'u1', insight_key: 'possible_double:k1:k2' })
    go('/reports')
    renderScreen(<Shell />, fake)
    await openShops()
    const look = await card('Worth a second look')
    expect(within(look).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Possible repeat charge: COFFEE HOUSE$4.50 on 21 Sep, and the same again on 23 Sep.If one was a mistake, ask the shop for a refund.',
      'Maybe counted twice: TEA ROOM$6.25 you added, and $6.25 from your statement: 22 Sep and 23 Sep.If they are one purchase, remove the one you added in All transactions.',
      'Bigger than usual: CAFE$180.00 on 20 Sep. A usual charge in Dining out is about $25.00.',
      'First charge from a new shop: FURNITURE CO$450.00 on 12 Sep.',
    ])
    expect(within(look).getByRole('link', { name: 'Open All transactions' }).getAttribute('href')).toBe('#/ledger')
  })

  it('says so when nothing stands out', async () => {
    go('/reports/2026-07')
    renderScreen(<Shell />, shopsFake())
    await openShops()
    expect(within(await card('Worth a second look')).getByText('Nothing unusual in these days.')).toBeTruthy()
  })
})
