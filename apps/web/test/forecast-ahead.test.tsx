import { act, cleanup, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFake } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** The card under a heading, and a row of its table as text. */
async function aheadCard(): Promise<HTMLElement> {
  return (await screen.findByRole('heading', { name: 'The next three months' })).closest('div.rounded-xl') as HTMLElement
}
const rowOf = (card: HTMLElement, label: string) =>
  [...(within(card).getByRole('rowheader', { name: label }).parentElement?.querySelectorAll('td') ?? [])].map((td) => td.textContent)

beforeAll(() => warmScreen('#/forecast', 'Forecast'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the next three months on the Forecast (plan §2.5, A14, F35)', () => {
  it('chains each month’s end from this month’s, labelled worst and best case, with a rent rise from November', async () => {
    // F35's worked example: Rent $1,300.00 from November, typed ahead.
    const fake = forecastFake()
    fake.tables.category_plans.push({ id: 'p4', category_id: 'rent', effective_month: '2026-11-01', planned_cents: 130_000, due_day: 1 })
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await aheadCard()
    expect(within(card).getByText('Range')).toBeTruthy()
    expect(within(card).getByText('Based on 3 months')).toBeTruthy()
    expect(within(card).getByText(/worst case to best case\. Not a promise\./)).toBeTruthy()
    expect(within(card).getByRole('img', { name: 'Where the next three months end' })).toBeTruthy()
    expect(within(card).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['What', 'Oct 2026', 'Nov 2026', 'Dec 2026'])
    expect(rowOf(card, 'Pay')).toEqual(['$4,200.00', '$4,200.00', '$4,200.00'])
    expect(rowOf(card, 'Bills')).toEqual(['$1,340.00', '$1,440.00', '$1,440.00'])
    expect(rowOf(card, 'Everyday spending')).toEqual(['about $1,050', 'about $1,050', 'about $1,050'])
    expect(rowOf(card, 'Savings')).toEqual(['$500.00', '$500.00', '$500.00'])
    expect(rowOf(card, 'Left over')).toEqual(['about $1,310', 'about $1,210', 'about $1,210'])
    expect(rowOf(card, 'Worst case end')).toEqual(['$4,430', '$5,450', '$6,470'])
    expect(rowOf(card, 'Most likely end')).toEqual(['$4,620', '$5,820', '$7,030'])
    expect(rowOf(card, 'Best case end')).toEqual(['$4,770', '$6,130', '$7,490'])
    // Each row's name stays in view as the months scroll sideways on a narrow phone.
    expect(within(card).getAllByRole('rowheader').every((th) => th.classList.contains('sticky'))).toBe(true)
    await expectNoAxeViolations()
  })

  it('shows what each month leaves over, and no ends, without this month’s start (D17)', async () => {
    go('/forecast')
    renderScreen(<Shell />, forecastFake(null))

    const card = await aheadCard()
    expect(within(card).getByRole('img', { name: 'What the next three months leave over' })).toBeTruthy()
    expect(rowOf(card, 'Left over')).toEqual(['about $1,310', 'about $1,310', 'about $1,310'])
    expect(within(card).queryByRole('rowheader', { name: 'Most likely end' })).toBeNull()
    expect(within(card).getByText('Type this month’s starting balance on the Month to see where each month ends.')).toBeTruthy()
  })

  it('gives one rough figure with under three whole months of records', async () => {
    const fake = forecastFake()
    fake.tables.ingest_batches.splice(0, 1, { id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-08-01', period_end: '2026-09-20' })
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await aheadCard()
    expect(within(card).getByText('Rough')).toBeTruthy()
    expect(within(card).getByText('Based on 1 month')).toBeTruthy()
    expect(rowOf(card, 'Worst case end')).toEqual(rowOf(card, 'Best case end'))
  })

  it('says when to check back with no whole month of records', async () => {
    const fake = forecastFake()
    fake.tables.ingest_batches.splice(0, 1, { id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-09-12', period_end: '2026-09-20' })
    go('/forecast')
    renderScreen(<Shell />, fake)

    const card = await aheadCard()
    expect(within(card).getByText('Too early to tell: check back on 1 Nov 2026, once a whole month of records is in.')).toBeTruthy()
    expect(within(card).queryByRole('table')).toBeNull()
  })
})
