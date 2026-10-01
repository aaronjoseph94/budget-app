import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarScreen } from '../src/screens/CalendarScreen.js'
import { useAddress } from '../src/nav.js'
import type { Category, LedgerRow, PayScheduleRow, PlanRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const cat = (id: string, name: string, kind: Category['kind'], sort_order: number): Category => ({
  id, name, kind, sort_order, weekly_budget_cents: null,
})
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const plan = (id: string, category_id: string, planned_cents: number | null, due_day: number | null): PlanRow => ({
  id, category_id, effective_month: '2026-01-01', planned_cents, due_day,
})
const pays = (id: string, category_id: string, first_pay_date: string, frequency: PayScheduleRow['frequency']): PayScheduleRow => ({
  id, category_id, first_pay_date, frequency,
})

// Hand-derived for September 2026, which starts on a Tuesday:
//   1 – 5 Sep    Rent 1,600.00 planned                         1,600.00
//   6 – 12 Sep   Phone 58.12 charged on the 8th, not its planned
//                55.00 on the 5th (D5); Day job paid the 11th      58.12
//   13 – 19 Sep  nothing                                           0.00
//   20 – 26 Sep  Tunes 11.99 planned; Day job paid the 25th        11.99
//   27 – 30 Sep  Car loan 300.00, due the 31st, on the 30th (D21)  300.00
//   Month: 1,970.11. Gym has no day paid, so is in no total.
function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      cat('rent', 'Rent', 'bill', 0),
      cat('phone', 'Phone', 'bill', 1),
      cat('gym', 'Gym', 'bill', 2),
      cat('loan', 'Car loan', 'debt', 0),
      cat('music', '<b>Tunes & more</b>', 'subscription', 0),
      cat('groceries', 'Groceries', 'variable', 0),
      cat('pay', 'Day job', 'income', 0),
      cat('fund', 'Flight fund', 'savings', 0),
    ],
    category_plans: [
      plan('p1', 'rent', 160000, 1),
      plan('p2', 'phone', 5500, 5),
      plan('p3', 'gym', 4500, null),
      plan('p4', 'loan', 30000, 31),
      plan('p5', 'music', 1199, 20),
    ],
    transactions: [tx('t1', '2026-09-08', -5812, 'phone'), tx('t2', '2026-09-03', -4000, 'groceries')],
    // The fund's schedule was left behind when it moved off Income (N27).
    pay_schedules: [pays('s1', 'pay', '2026-09-11', 'biweekly'), pays('s2', 'fund', '2026-09-01', 'monthly')],
  })
}

/** A week's lines as the screen shows them, heading first. */
async function week(range: string): Promise<string[]> {
  const region = await screen.findByRole('region', { name: `Week of ${range}` })
  return [region.querySelector('h2'), ...region.querySelectorAll('li, p')].map((e) => e?.textContent ?? '')
}

/** The month's total pill, once the month is in. */
async function total(): Promise<string | undefined> {
  return (await screen.findByText('Due this month')).parentElement?.textContent ?? undefined
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

describe('CalendarScreen', () => {
  it("shows this month's title and, in the workbook's pill, what is due in it (J3)", async () => {
    renderScreen(<CalendarScreen month={null} />, seeded())

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(await total()).toBe('Due this month: $1,970.11')
    // Said on the pill itself: a lone figure in a band means nothing to the eye.
    expect(screen.getByText('Due this month').className).not.toContain('sr-only')
    await expectNoAxeViolations()
  })

  it("lays this month's bills on their days, real charges in place of the plan, with paydays and week totals", async () => {
    renderScreen(<CalendarScreen month={null} />, seeded())

    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(await week('1 – 5 Sep')).toEqual(['1 – 5 SepWeek total $1,600.00', 'Tue1Rent$1,600.00 planned', 'Rent$1,600.00 planned'])
    expect(await week('6 – 12 Sep')).toEqual([
      '6 – 12 SepWeek total $58.12',
      'Tue8Phone$58.12',
      'Phone$58.12',
      'Fri11Day job payday',
    ])
    expect(await week('13 – 19 Sep')).toEqual(['13 – 19 SepWeek total $0.00', 'Nothing due.'])
    // A category name is text, never markup.
    expect(await week('20 – 26 Sep')).toEqual([
      '20 – 26 SepWeek total $11.99',
      'Sun20<b>Tunes & more</b>$11.99 planned',
      '<b>Tunes & more</b>$11.99 planned',
      'Fri25Day job payday',
    ])
    expect(await week('27 – 30 Sep')).toEqual(['27 – 30 SepWeek total $300.00', 'Wed30Car loan$300.00 planned', 'Car loan$300.00 planned'])
    expect(screen.getByText('Due this month').parentElement?.textContent).toBe('Due this month: $1,970.11')
    expect(screen.queryByText('Groceries')).toBeNull()
  })

  it("draws the workbook's grid for a wide screen, Sunday first, with each week's total in its last column", async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())

    const grid = await screen.findByRole('table', { name: /^Bills and paydays by day, with each week’s total\. Amounts in italics are planned/ })
    const rows = within(grid).getAllByRole('row').map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent))
    expect(rows[0]).toEqual(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Week'])
    expect(rows[1]).toEqual(['', '', '1Rent1,600.00 planned', '2', '3', '4', '5', 'Week total $1,600.00'])
    expect(rows[2]).toEqual(['6', '7', '8Phone58.12', '9', '10', '11Payday: Day job', '12', 'Week total $58.12'])
    expect(rows[4]?.[0]).toBe('20<b>Tunes & more</b>11.99 planned')
    expect(rows[5]).toEqual(['27', '28', '29', '30Car loan300.00 planned', '', '', '', 'Week total $300.00'])
    expect(rows).toHaveLength(6)
    // The name over its amount, the same on every day: some days stacked them
    // and some did not (V13). Two columns squeezed a tablet's name to a letter
    // a line ("R e n t"), and a desktop's broke "Insuranc e", so the name
    // wraps between words and breaks only a word wider than the day.
    const rent = within(grid).getByText('Rent')
    expect(rent.closest('p')?.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-col']))
    expect(rent.closest('p')?.className).not.toContain('grid-cols-')
    expect(rent.className.split(' ')).toEqual(expect.arrayContaining(['break-words', 'max-w-full']))
    expect(rent.className).not.toContain('anywhere')
  })

  it("keeps the phone's dotted month out of a screen reader's way, since the list under it says the same", async () => {
    const { container } = renderScreen(<CalendarScreen month="2026-09" />, seeded())
    await screen.findByRole('table')

    const picture = container.querySelector('div[aria-hidden="true"]')
    expect(picture?.textContent).toContain('a bill due')
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toContain('Week of 1 – 5 Sep')
  })

  it("marks the phone's dotted month with a dot per bill and a green number on each payday", async () => {
    const { container } = renderScreen(<CalendarScreen month="2026-09" />, seeded())
    await screen.findByRole('table')

    // Every day place after the weekday letters; the legend is a paragraph.
    const places = [...container.querySelectorAll('div[aria-hidden="true"] > div:not(:first-child) > div')]
    const marked = places.flatMap((place) => {
      const [number, dots] = place.children
      if (number === undefined || dots === undefined) return []
      const payday = number.classList.contains('bg-payday')
      return dots.children.length > 0 || payday ? [`${number.textContent}: ${dots.children.length}${payday ? ' payday' : ''}`] : []
    })
    expect(marked).toEqual(['1: 1', '8: 1', '11: 0 payday', '20: 1', '25: 0 payday', '30: 1'])
  })

  it('lists a monthly amount with no day paid apart, and leads to Setup to add one', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())

    const undated = within(await screen.findByRole('region', { name: 'No day paid' }))
    expect(undated.getByRole('listitem').textContent).toBe('Gym$45.00')
    fireEvent.click(undated.getByRole('button', { name: 'Add a day paid in Setup' }))
    expect(window.location.hash).toBe('#/setup')
  })

  it('steps a month at a time and writes it into the address', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())
    await total()

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(window.location.hash).toBe('#/calendar/2026-10')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(window.location.hash).toBe('#/calendar/2026-08')
  })

  it('shows no calendar, rather than one without its planned bills, when monthly amounts cannot be read', async () => {
    const fake = seeded()
    fake.fail('category_plans', 'PGRST205')
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Monthly amounts need a one-time update, so this calendar cannot be shown. (code PGRST205)',
    )
    expect(screen.queryByText('Due this month')).toBeNull()
  })

  it('says pay schedules need 0011 when the table is not there yet', async () => {
    const fake = seeded()
    fake.fail('pay_schedules', '42P01')
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain('need a one-time update, so this calendar cannot be shown. (code 42P01)')
  })

  it('says so, rather than leave a bill off, when its category did not load', async () => {
    const fake = seeded()
    fake.tables.category_plans.push(plan('p9', 'gone', 100, 3))
    renderScreen(<CalendarScreen month="2026-09" />, fake)

    expect((await screen.findByRole('alert')).textContent).toContain('names a category that did not load, so the calendar is not shown')
  })
})

describe('CalendarScreen, Mockup A grid (step 6)', () => {
  /** Two more on the 1st, beside Rent: a bill and a subscription. */
  function crowded(): FakeSupabase {
    const fake = seeded()
    fake.tables.categories.push(cat('water', 'Water', 'bill', 3), cat('news', 'News', 'subscription', 1))
    fake.tables.category_plans.push(plan('p6', 'water', 4000, 1), plan('p7', 'news', 900, 1))
    return fake
  }

  const cellOf = async (n: string) =>
    (await screen.findAllByRole('cell')).find((c) => c.firstElementChild?.firstElementChild?.firstElementChild?.textContent === n)

  it('draws each bill on a rule in its list’s hue and tints today', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())

    const rule = (name: string) => screen.getAllByRole('button', { name }).map((b) => b.parentElement?.className ?? '')
    await screen.findByRole('table')
    // Each twice: in the grid and in the phone's agenda.
    expect(rule('Rent').map((c) => c.includes('border-bills-accent'))).toEqual([true, true])
    expect(rule('Car loan').map((c) => c.includes('border-debts-accent'))).toEqual([true, true])
    expect(rule('<b>Tunes & more</b>').map((c) => c.includes('border-subscriptions-accent'))).toEqual([true, true])
    const today = document.querySelector('td[aria-current="date"]')
    expect(today?.textContent).toBe('23')
    expect(today?.className).toContain('bg-calendar-today')
    // The phone's dotted month marks the same day.
    const places = [...document.querySelectorAll('div[aria-hidden="true"] > div:not(:first-child) > div > span')]
    expect(places.filter((n) => n.classList.contains('bg-calendar-today')).map((n) => n.textContent)).toEqual(['23'])
  })

  it('shows two bills in a crowded day, then "+N more", which opens the whole day in a sheet (design-review P2 item 8)', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, crowded())

    const first = within((await cellOf('1')) ?? document.body)
    expect(first.getAllByRole('button').map((b) => b.textContent)).toEqual(['Rent', 'Water', '+1 more on 1 Sep 2026'])
    const more = first.getByRole('button', { name: '+1 more on 1 Sep 2026' })
    // A click focuses a button in a browser; fireEvent does not, so it is done here.
    more.focus()
    fireEvent.click(more)

    const day = within(screen.getByRole('dialog', { name: '1 Sep 2026' }))
    expect(day.getAllByRole('paragraph').map((p) => p.textContent)).toEqual([
      'Rent$1,600.00 planned',
      'Water$40.00 planned',
      'News$9.00 planned',
    ])
    fireEvent.click(day.getByRole('button', { name: 'News' }))
    expect(screen.queryByRole('dialog', { name: '1 Sep 2026' })).toBeNull()
    const charges = screen.getByRole('dialog', { name: 'News' })
    await expectNoAxeViolations()
    // Its charges closed, focus goes back to "+1 more", not to the page.
    fireEvent.click(within(charges).getByRole('button', { name: 'Close' }))
    expect(document.activeElement).toBe(more)
  })
})

describe('CalendarScreen while another month loads', () => {
  function Routed() {
    return <CalendarScreen month={useAddress().param} />
  }

  it("never shows one month's bills under the next month's title", async () => {
    window.location.hash = '/calendar/2026-09'
    renderScreen(<Routed />, seeded())
    expect(await total()).toBe('Due this month: $1,970.11')

    act(() => {
      window.location.hash = '/calendar/2026-10'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeTruthy()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText('Due this month')).toBeNull()

    // October: every monthly amount planned, none charged, and the Gym undated.
    expect(await total()).toBe('Due this month: $1,966.99')
  })
})

describe('CalendarScreen, a bill opened (N51)', () => {
  it("opens the bill's charges for the month, each with Move to…", async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())
    const agenda = within(await screen.findByRole('region', { name: 'Week of 6 – 12 Sep' }))
    fireEvent.click(agenda.getByRole('button', { name: 'Phone' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Phone' }))
    expect(sheet.getByText(/^Bills · September 2026 ·/)).toBeTruthy()
    expect(sheet.getAllByRole('button', { name: /^Move to…/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Move to… (SYNTHETIC SHOP, 8 Sep 2026)',
    ])
  })

  it('says a planned bill has nothing charged yet, and that its amount is from Setup', async () => {
    renderScreen(<CalendarScreen month="2026-09" />, seeded())
    const agenda = within(await screen.findByRole('region', { name: 'Week of 1 – 5 Sep' }))
    fireEvent.click(agenda.getByRole('button', { name: 'Rent' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Rent' }))
    expect(sheet.getByText(/^No charges filed here in September\. The amount above is its monthly amount from Setup\./)).toBeTruthy()
  })
})
