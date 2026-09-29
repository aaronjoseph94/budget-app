import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)
// Short enough that the legend shows it whole beside "$20.00 · 20%".
const NAME = '<img src=x onerror=a> & co'

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const tx = (id: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on: '2026-09-10', amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})

/**
 * Hand-derived. Variable: groceries 60.00 + 20.00 = 80.00 and the oddly
 * named one 20.00, of 100.00 above zero: 80% and 20%. Clothing's 40.00
 * return has no purchase, so it is below zero and not drawn (F17); it sits
 * between the two on the list, so the oddly named one is the third row.
 * Books has nothing this month: no slice, and nothing to say about it. Pay
 * 2,500.00 against a 3,000.00 goal; Side hustle has neither and no bar.
 */
function seeded(transactions: LedgerRow[]): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('groceries', 'Groceries', 'variable', 0),
      cat('clothing', 'Clothing', 'variable', 1),
      cat('odd', NAME, 'variable', 2),
      cat('books', 'Books', 'variable', 3),
      cat('pay', 'Pay', 'income', 0),
      cat('side', 'Side hustle', 'income', 1),
    ],
    transactions,
    category_budgets: [
      { id: 'b1', user_id: 'u1', category_id: 'pay', month: '2026-09-01', applies: 'onward', budget_cents: 300000 },
    ],
  })
}
const MONTH = [tx('t1', -6000, 'groceries'), tx('t2', -2000, 'groceries'), tx('t3', -2000, 'odd'), tx('t4', 4000, 'clothing'), tx('t5', 250000, 'pay')]

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

const charts = async () => within(await screen.findByRole('region', { name: 'Charts' }))
const texts = (chart: HTMLElement) => [...chart.querySelectorAll('text')].map((t) => t.textContent)

describe('MonthCharts', () => {
  it('draws the Variable expenses by share, each slice in its row\'s colour, and names each one', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded(MONTH))

    const doughnut = (await charts()).getByRole('img', { name: 'Variable expenses by category' })
    // Groceries is the list's first row and takes the workbook's palest coral; the
    // oddly named one is its third row and takes the third step, though
    // Clothing between them has no slice (Jan chart13's colours by row).
    expect([...doughnut.querySelectorAll('path')].map((p) => p.getAttribute('fill'))).toEqual(['#F97316', '#8B5CF6'])
    expect(texts(doughnut)).toEqual(['Groceries', '$80.00 · 80%', NAME, '$20.00 · 20%'])
    expect(doughnut.querySelector('desc')?.textContent).toBe(
      `Groceries: $80.00, 80% of spending. ${NAME}: $20.00, 20% of spending. Clothing is not drawn: refunds were more than spending.`,
    )
    expect((await charts()).getByText(/^Not in the ring, as refunds were more than spending: Clothing \(-\$40\.00\)\.$/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  // The chart is markup the app puts into the page; a name inside it that
  // became markup would run.
  it('shows a category name with < and & as text, never as an element', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded(MONTH))

    const region = await screen.findByRole('region', { name: 'Charts' })
    expect(within(region).getByText(NAME, { selector: 'text' })).toBeTruthy()
    expect(region.querySelector('img')).toBeNull()
    expect(region.querySelectorAll('[onerror]')).toHaveLength(0)
  })

  it('draws each income source with a goal or money in, its Actual against its Goal', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded(MONTH))

    const bars = (await charts()).getByRole('img', { name: 'Income against goals' })
    expect(texts(bars)).toEqual(['Goal', 'Actual', 'Pay', '$2,500.00 of $3,000.00'])
    // One scale, the largest: the goal's track is the whole width, and 2,500
    // of 3,000 is 8,333 bp of it, 2,500 units of 3,000.
    const widths = [...bars.querySelectorAll('rect[rx="40"]')].map((r) => [r.getAttribute('fill'), r.getAttribute('width')])
    expect(widths).toEqual([
      ['#D1FAE5', '3000'],
      ['#10B981', '2500'],
    ])
    expect(bars.querySelector('desc')?.textContent).toBe('Pay: $2,500.00 of a $3,000.00 goal.')
  })

  it('draws money in with no goal as a bar alone, on the same scale', async () => {
    renderScreen(<MonthScreen month="2026-09" />, seeded([...MONTH, tx('t6', 50000, 'side')]))

    const bars = (await charts()).getByRole('img', { name: 'Income against goals' })
    expect(texts(bars)).toEqual(['Goal', 'Actual', 'Pay', '$2,500.00 of $3,000.00', 'Side hustle', '$500.00'])
    // 500 of the 3,000.00 scale is 1,667 bp, 500 units of 3,000; no track.
    const widths = [...bars.querySelectorAll('rect[rx="40"]')].map((r) => [r.getAttribute('fill'), r.getAttribute('width')])
    expect(widths).toEqual([
      ['#D1FAE5', '3000'],
      ['#10B981', '2500'],
      ['#10B981', '500'],
    ])
    expect(bars.querySelector('desc')?.textContent).toBe(
      'Pay: $2,500.00 of a $3,000.00 goal. Side hustle: $500.00, no goal.',
    )
  })

  it('says there is nothing to draw in a month with no spending, income or goals', async () => {
    renderScreen(<MonthScreen month="2026-08" />, seeded(MONTH))

    const region = await charts()
    expect(region.getByText('Nothing spent on Variable expenses this month yet.')).toBeTruthy()
    // August has Pay's goal from no month before it, and no money in.
    expect(region.getByText('No income or goals this month yet.')).toBeTruthy()
    expect(region.queryAllByRole('img')).toHaveLength(0)
  })
})
