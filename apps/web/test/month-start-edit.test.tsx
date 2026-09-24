import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { useAddress } from '../src/nav.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind']): Category => ({
  id, name, kind, sort_order: 0, weekly_budget_cents: null,
})
const row = (id: string, posted_on: string, amount_cents: number, category_id: string) => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'typed',
})
const balance = (month: string, starting_balance_cents: number) => ({ id: `mb-${month}`, user_id: 'u1', month, starting_balance_cents })

/** September: 100.00 spent, 2,500.00 in, 300.00 saved, so End of month is the start + 2,100.00 (F7). */
function seeded(...month_balances: ReturnType<typeof balance>[]): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries', 'variable'), cat('pay', 'Pay', 'income'), cat('fund', 'Flight fund', 'savings')],
    transactions: [row('t1', '2026-09-02', -10000, 'groceries'), row('t2', '2026-09-15', 250000, 'pay'), row('t3', '2026-09-16', -30000, 'fund')],
    month_balances,
  })
}

const said = 'Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'
const summary = () => within(screen.getByRole('region', { name: 'Summary' }))
const value = (label: string) => (summary().getByText(label).nextSibling as HTMLElement).textContent
const stored = (fake: FakeSupabase) => fake.tables.month_balances.map((b) => [b.month, b.starting_balance_cents])
const field = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Starting bank balance for September' })
const overdrawn = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Overdrawn: the account was below $0' })

async function open(fake: FakeSupabase) {
  renderScreen(<MonthScreen month="2026-09" />, fake)
  fireEvent.click(await screen.findByRole('button', { name: /^Starting balance for September, / }))
  return field()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  window.location.hash = ''
})

describe('Typing the starting balance on the Month', () => {
  it('saves it for this month alone, re-reads the month, and says what it did', async () => {
    const fake = seeded()
    fireEvent.change(await open(fake), { target: { value: '$3,240.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((await summary().findByRole('status')).textContent).toBe('September started at $3,240.50.')
    expect(fake.tables.month_balances).toMatchObject([{ user_id: 'u1', month: '2026-09-01', starting_balance_cents: 324050 }])
    // Core's, from the month read again: 3,240.50 + 2,100.00.
    await waitFor(() => expect(value('End of month')).toBe('$5,340.50'))
    expect(value('Start')).toBe('$3,240.50')
    expect(screen.queryByRole('textbox')).toBeNull()
    cleanup()

    renderScreen(<MonthScreen month="2026-10" />, fake)
    expect(await screen.findByRole('button', { name: 'Starting balance for October, none typed' })).toBeTruthy()
  })

  it('types an overdrawn start with the tick box, and opens one again that way', async () => {
    const fake = seeded()
    fireEvent.change(await open(fake), { target: { value: '150' } })
    fireEvent.click(overdrawn())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    // −150.00 + 2,100.00.
    await waitFor(() => expect(value('End of month')).toBe('$1,950.00'))
    expect(stored(fake)).toEqual([['2026-09-01', -15000]])
    fireEvent.click(screen.getByRole('button', { name: 'Starting balance for September, -$150.00' }))
    expect(field().value).toBe('150.00')
    expect(overdrawn().checked).toBe(true)
  })

  it('clears it, leaving no End of month, and offers Clear only when one is typed (D17)', async () => {
    const fake = seeded(balance('2026-09-01', 100000))
    expect((await open(fake)).value).toBe('1000.00')
    fireEvent.click(screen.getByRole('button', { name: 'Clear balance' }))

    expect((await summary().findByRole('status')).textContent).toBe("September's starting balance is cleared.")
    expect(stored(fake)).toEqual([])
    await waitFor(() => expect(value('Start')).toBe('Type your starting bank balance'))
    expect(value('End of month')).toBe('Shown once Start is typed')
    fireEvent.click(screen.getByRole('button', { name: 'Starting balance for September, none typed' }))
    expect(screen.queryByRole('button', { name: 'Clear balance' })).toBeNull()
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('refuses what is not an amount, in words, and saves nothing', async () => {
    const fake = seeded()
    const typed = await open(fake)
    for (const [text, below] of [['lots', false], ['', false], ['12.345', false], ['-5', true]] as const) {
      fireEvent.change(typed, { target: { value: text } })
      if (overdrawn().checked !== below) fireEvent.click(overdrawn())
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(screen.getByRole('alert').textContent).toBe('Type the balance as an amount, like 2400 or 2,400.00.')
    }
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(fake.tables.month_balances).toEqual([])
  })

  it('says why a save was refused, in its editor, and keeps what was typed', async () => {
    const refused = seeded()
    refused.fail('POST month_balances', '42501')
    fireEvent.change(await open(refused), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toBe(said)
    expect(field().value).toBe('100')
  })

  it('says so on the Month when a save is refused after another month opened, until its editor opens again', async () => {
    const moved = seeded()
    moved.fail('POST month_balances', '42501')
    let answer = (): void => undefined
    const answered = new Promise<void>((resolve) => {
      answer = resolve
    })
    moved.server.hold = (target) => (target === 'POST month_balances' ? answered : null)
    function Routed() {
      return <MonthScreen month={useAddress().param} />
    }
    window.location.hash = '/month/2026-09'
    renderScreen(<Routed />, moved)
    fireEvent.click(await screen.findByRole('button', { name: 'Starting balance for September, none typed' }))
    fireEvent.change(field(), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    act(() => {
      window.location.hash = '/month/2026-10'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    answer()
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy()
    expect((await screen.findByRole('alert')).textContent).toBe(`The starting balance was not saved` + `September: ${said}`)
    fireEvent.click(await screen.findByRole('button', { name: 'Starting balance for October, none typed' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
