import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ListsTab } from '../src/settings/ListsTab.js'
import type { Category, PlanRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The workbook's Bills tab inside Setup (S9): each Bills, Debts and Subscriptions
 * row's day paid and monthly amount, from this month on (D13). Today is fixed
 * at 23 September 2026, so "this month" is September. Names are the workbook's
 * placeholders; amounts are invented.
 */

const TODAY = new Date('2026-09-23T12:00:00')

const category = (id: string, name: string, kind: Category['kind'], sortOrder: number): Category => ({
  id,
  name,
  kind,
  sort_order: sortOrder,
  weekly_budget_cents: null,
})
const plan = (id: string, categoryId: string, month: string, cents: number | null, day: number | null): PlanRow => ({
  id,
  category_id: categoryId,
  effective_month: `${month}-01`,
  planned_cents: cents,
  due_day: day,
})

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      category('rent', 'Rent', 'bill', 0),
      category('phone', 'Phone', 'bill', 1),
      category('car-loan', 'Car Loan', 'debt', 0),
      category('netflix', 'Netflix', 'subscription', 0),
      category('groceries', 'Groceries', 'variable', 0),
    ],
    category_plans: [
      plan('p1', 'rent', '2026-01', 160_000, 1),
      plan('p2', 'phone', '2026-03', 8_500, null),
      plan('p3', 'netflix', '2026-01', 1_799, 23),
      plan('p4', 'netflix', '2026-06', null, 23),
    ],
  })
}

const card = async (name: string) => within(await screen.findByRole('region', { name }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Lists, reading monthly amounts', () => {
  it('says once that monthly amounts need 0009, and the lists still work', async () => {
    const fake = seeded()
    fake.fail('category_plans', 'PGRST205')
    renderScreen(<ListsTab />, fake)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      'Monthly amounts need a one-time update, so they are not shown. Your lists still work. (code PGRST205) See One-time updates',
    )
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const field = (await card('Bills')).getByRole('textbox', { name: 'Rename Phone' })
    fireEvent.change(field, { target: { value: 'Mobile' } })
    fireEvent.blur(field)
    await waitFor(() => expect(fake.tables.categories.find((c) => c.id === 'phone')?.name).toBe('Mobile'))
    await expectNoAxeViolations()
  })

  it('says so when an amount names a category that is not there, rather than total without it', async () => {
    const fake = seeded()
    fake.tables.category_plans.push(plan('p9', 'gone', '2026-02', 5_000, 3))
    renderScreen(<ListsTab />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe(
      'A monthly amount names a category that did not load, so the totals are not shown. Try again.',
    )
  })

  it('says plainly when the amounts read cannot be shown, and the lists still work', async () => {
    const fake = seeded()
    // A row 0009 would refuse: a month is named by its first day.
    fake.tables.category_plans.push({ ...plan('p9', 'rent', '2026-02', 5_000, 3), effective_month: '2026-02-15' })
    renderScreen(<ListsTab />, fake)

    expect((await screen.findByRole('alert')).textContent).toBe('Your monthly amounts could not be shown.')
    const bills = await card('Bills')
    expect(bills.getByRole('textbox', { name: 'Rename Rent' })).toBeTruthy()
    expect(bills.queryByRole('textbox', { name: /^Day paid/ })).toBeNull()
    expect(screen.queryByText('Fixed monthly bills')).toBeNull()
  })

  it('waits for the amounts read after a category is removed, rather than call them wrong', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    const bills = await card('Bills')
    await bills.findByRole('button', { name: 'Remove Phone' })
    // The amounts read after the removal are held back: until they arrive,
    // the ones read before it still name Phone.
    let release = () => {}
    fake.server.hold = (table) => (table === 'category_plans' ? new Promise<void>((resolve) => (release = resolve)) : null)
    fireEvent.click(bills.getByRole('button', { name: 'Remove Phone' }))

    await waitFor(() => expect(bills.queryByRole('textbox', { name: 'Rename Phone' })).toBeNull())
    expect(fake.tables.category_plans.map((p) => p.id)).toEqual(['p1', 'p3', 'p4'])
    expect(screen.queryByRole('alert')).toBeNull()
    fake.server.hold = null
    release()
    await waitFor(() => expect(bills.getByRole('textbox', { name: 'Rename Rent' })).toBeTruthy())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says nothing about the amounts until the lists have loaded', async () => {
    const fake = seeded()
    // The lists are held back on the first load, so until they arrive every
    // amount names a category the screen has not been given yet.
    let release = () => {}
    const asked: string[] = []
    fake.server.hold = (table) => {
      asked.push(table)
      if (table !== 'categories' || asked.filter((t) => t === 'categories').length > 1) return null
      return new Promise<void>((resolve) => (release = resolve))
    }
    renderScreen(<ListsTab />, fake)

    // Every other read of the first load is in, and none of the amounts was
    // asked for: nothing is read, or said, until the lists arrive. Waited on
    // what was asked, not on a stretch of time, which a slow run outlasts.
    await waitFor(() => expect(asked).toEqual(expect.arrayContaining(['categories', 'savings_goals', 'ingest_candidates'])))
    expect(asked).not.toContain('category_plans')
    expect(screen.queryByRole('alert')).toBeNull()
    release()
    await waitFor(async () => expect(await tile('Bills total', 'Bills')).toBe('$1,685.00'))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

/** A field in a card, by its accessible name. */
const field = async (list: string, name: string) => (await card(list)).findByRole<HTMLInputElement>('textbox', { name })
/** Type into a field and leave it, which is when Setup saves. */
const type = async (list: string, name: string, value: string) => {
  const input = await field(list, name)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
  return input
}
const september = (fake: FakeSupabase) =>
  fake.tables.category_plans.filter((p) => p.effective_month === '2026-09-01').map((p) => [p.category_id, p.planned_cents, p.due_day])

describe('Lists, day paid and monthly amount', () => {
  it('shows what is in effect this month on each recurring row, and nothing on the other lists', async () => {
    renderScreen(<ListsTab />, seeded())

    const rentAmount = await field('Bills', 'Monthly amount for Rent, from September on')
    await waitFor(() => expect(rentAmount.value).toBe('1600.00'))
    expect((await field('Bills', 'Day paid for Rent')).value).toBe('1')
    expect((await field('Bills', 'Monthly amount for Phone, from September on')).value).toBe('85.00')
    expect((await field('Bills', 'Day paid for Phone')).value).toBe('')
    // Netflix stopped from June: no amount, its day kept, nothing to stop.
    expect((await field('Subscriptions', 'Monthly amount for Netflix, from September on')).value).toBe('')
    expect((await field('Subscriptions', 'Day paid for Netflix')).value).toBe('23')
    expect((await card('Subscriptions')).queryByRole('button', { name: /^Stop / })).toBeNull()
    expect((await field('Debts', 'Monthly amount for Car Loan, from September on')).value).toBe('')
    // A head on one line, and the month it starts from said once in the hint (V16).
    expect((await card('Bills')).getByText('Monthly amount')).toBeTruthy()
    expect((await card('Bills')).getByText(/Amounts apply from September on\./)).toBeTruthy()
    // F8: an amount with no day counts in the month, never in a week.
    expect((await card('Bills')).getAllByText('Add a day paid so this shows in weeks.')).toHaveLength(1)
    // Car Loan has neither, so there is nothing to nudge.
    expect((await card('Debts')).queryByText('Add a day paid so this shows in weeks.')).toBeNull()
    expect((await card('Variable expenses')).queryByRole('textbox', { name: /^Day paid/ })).toBeNull()
    // Plan §3.3: the Debts card keeps saying the card itself is not a Debts row.
    expect((await card('Debts')).getByText('Bank loans only; a card is Not spending.')).toBeTruthy()
  })

  it('saves an amount from this month on, keeping the day and every earlier month', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Monthly amount for Rent, from September on')).value).toBe('1600.00'))

    const input = await type('Bills', 'Monthly amount for Rent, from September on', '$1,650')

    expect(await (await card('Bills')).findByRole('status')).toHaveProperty('textContent', 'Rent: $1,650.00 a month from September on.')
    expect(september(fake)).toEqual([['rent', 165_000, 1]])
    expect(fake.tables.category_plans.find((p) => p.id === 'p1')).toMatchObject({ planned_cents: 160_000, due_day: 1 })
    await waitFor(() => expect(input.value).toBe('1650.00'))
  })

  it('saves a day paid from this month on, keeping the amount', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Monthly amount for Phone, from September on')).value).toBe('85.00'))

    await type('Bills', 'Day paid for Phone', '12')

    expect(await (await card('Bills')).findByText('Phone: paid on day 12 from September on.')).toBeTruthy()
    expect(september(fake)).toEqual([['phone', 8_500, 12]])
    await waitFor(async () => expect((await card('Bills')).queryByText('Add a day paid so this shows in weeks.')).toBeNull())
  })

  it('stops an amount from this month, keeping the day, which lets the category move', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)

    fireEvent.click(await (await card('Bills')).findByRole('button', { name: 'Stop Rent from September' }))

    expect(await (await card('Bills')).findByText('Rent: no monthly amount from September on.')).toBeTruthy()
    expect(september(fake)).toEqual([['rent', null, 1]])
    await waitFor(async () => expect((await card('Bills')).queryByRole('button', { name: 'Stop Rent from September' })).toBeNull())
    expect((await field('Bills', 'Monthly amount for Rent, from September on')).value).toBe('')
    fireEvent.change(await (await card('Bills')).findByRole('combobox', { name: 'Move Rent to another list' }), { target: { value: 'variable' } })
    await waitFor(() => expect(fake.tables.categories.find((c) => c.id === 'rent')?.kind).toBe('variable'))
  })

  it('stops an amount whose field is emptied, as Stop does', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Monthly amount for Rent, from September on')).value).toBe('1600.00'))

    await type('Bills', 'Monthly amount for Rent, from September on', '  ')

    expect(await (await card('Bills')).findByText('Rent: no monthly amount from September on.')).toBeTruthy()
    expect(september(fake)).toEqual([['rent', null, 1]])
  })

  it('keeps a day just typed when Stop is pressed next', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Day paid for Rent')).value).toBe('1'))

    await type('Bills', 'Day paid for Rent', '3')
    fireEvent.click((await card('Bills')).getByRole('button', { name: 'Stop Rent from September' }))

    await waitFor(() => expect(september(fake)).toEqual([['rent', null, 3]]))
  })

  it('saves nothing for a field left as it was, or typed again the same', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Day paid for Rent')).value).toBe('1'))

    await type('Bills', 'Day paid for Rent', '1')
    await type('Bills', 'Monthly amount for Rent, from September on', '1,600')
    await type('Debts', 'Day paid for Car Loan', '')
    // A change made after them is saved, and nothing else is.
    await type('Bills', 'Day paid for Phone', '12')

    await waitFor(() => expect(september(fake)).toEqual([['phone', 8_500, 12]]))
    expect(fake.tables.category_plans).toHaveLength(5)
  })

  it('refuses a day or an amount it cannot save, puts the field back, and saves nothing', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Day paid for Rent')).value).toBe('1'))

    for (const typed of ['45', '0']) {
      const day = await type('Bills', 'Day paid for Rent', typed)
      expect((await card('Bills')).getByRole('alert').textContent).toBe('Type the day of the month it is paid, 1 to 31, or leave it blank.')
      expect(day.value).toBe('1')
      // Tied to the field it is about, so a screen reader reads it there (FE-8).
      expect(day.getAttribute('aria-invalid')).toBe('true')
      expect(document.getElementById(day.getAttribute('aria-describedby') ?? '')?.textContent).toMatch(/^Type the day of the month/)
    }
    for (const typed of ['-5', 'about 20']) {
      const amount = await type('Bills', 'Monthly amount for Rent, from September on', typed)
      expect((await card('Bills')).getByText('Type the monthly amount as $0 or more, like 1600 or 17.99, or leave it blank.')).toBeTruthy()
      expect(amount.value).toBe('1600.00')
    }
    expect(september(fake)).toEqual([])
  })
})

describe('Lists, monthly amounts saved in quick succession or refused', () => {
  it('keeps a day left just before the amount, sending the amount only once the day is saved', async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Monthly amount for Phone, from September on')).value).toBe('85.00'))
    // The first save is stored and its answer held back, so the day is on its
    // way, and not yet read back, when the amount is left.
    let release = () => {}
    fake.server.hold = (target) => {
      if (target !== 'POST category_plans') return null
      fake.server.hold = null
      return new Promise<void>((resolve) => (release = resolve))
    }

    await type('Bills', 'Day paid for Phone', '12')
    await type('Bills', 'Monthly amount for Phone, from September on', '95')
    await waitFor(() => expect(september(fake)).toEqual([['phone', 8_500, 12]]))
    release()

    await waitFor(() => expect(september(fake)).toEqual([['phone', 9_500, 12]]))
    expect(await (await card('Bills')).findByText('Phone: $95.00 a month from September on.')).toBeTruthy()
    await waitFor(async () => expect((await field('Bills', 'Day paid for Phone')).value).toBe('12'))
  })

  it("says the list can't have an amount when the category moved on another device, and puts the field back", async () => {
    const fake = seeded()
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect((await field('Bills', 'Monthly amount for Phone, from September on')).value).toBe('85.00'))
    // Another device stopped Phone's amount and moved it to Variable expenses.
    fake.tables.categories = fake.tables.categories.map((c) => (c.id === 'phone' ? { ...c, kind: 'variable' } : c))

    const amount = await type('Bills', 'Monthly amount for Phone, from September on', '90')

    const alert = await (await card('Bills')).findByRole('alert')
    expect(alert.textContent).toBe(
      "That list can't have a monthly amount: only Bills, Debts and Subscriptions can. It may have been moved on another device. Nothing was saved. (code 23514)",
    )
    expect(amount.value).toBe('85.00')
    expect(september(fake)).toEqual([])
  })
})

/** A tile's figure, found by its label, in a card or anywhere. */
const tile = async (label: string, list?: string) => {
  const term = list === undefined ? await screen.findByText(label) : await (await card(list)).findByText(label)
  return term.nextElementSibling?.textContent
}

describe("Lists, the workbook's total tiles", () => {
  it('totals each card and all three together, to the cent, for this month', async () => {
    const fake = seeded()
    fake.tables.categories.push(category('spotify', 'Spotify', 'subscription', 1))
    fake.tables.category_plans.push(plan('p5', 'spotify', '2026-02', 1_199, 2))
    renderScreen(<ListsTab />, fake)

    // Rent 1,600 + Phone 85; nothing on Debts; Netflix stopped, Spotify 11.99.
    await waitFor(async () => expect(await tile('Bills total', 'Bills')).toBe('$1,685.00'))
    expect(await tile('Debts total', 'Debts')).toBe('$0.00')
    expect(await tile('Subscriptions total', 'Subscriptions')).toBe('$11.99')
    // D7: the workbook's Bills!H36 would leave the subscriptions out, at $1,685.00.
    expect(await tile('Fixed monthly bills')).toBe('$1,696.99')
    expect(screen.getByText('Bills, debts and subscriptions together, in September 2026.')).toBeTruthy()
    expect((await card('Variable expenses')).queryByText(/ total$/)).toBeNull()
    // Mockup A: each total runs across its card's foot on the list's own tint.
    const tints = ['Bills', 'Debts', 'Subscriptions'].map((list) => screen.getByText(`${list} total`).parentElement?.className.match(/bg-[a-z]+-header/)?.[0])
    expect(tints).toEqual(['bg-bills-header', 'bg-debts-header', 'bg-subscriptions-header'])
  })

  it('follows a saved amount, a stop and a later month', async () => {
    const fake = seeded()
    // October's rise is typed already; September's totals do not see it (D13).
    fake.tables.category_plans.push(plan('p6', 'rent', '2026-10', 170_000, 1))
    renderScreen(<ListsTab />, fake)
    await waitFor(async () => expect(await tile('Bills total', 'Bills')).toBe('$1,685.00'))

    await type('Debts', 'Monthly amount for Car Loan, from September on', '350')
    await waitFor(async () => expect(await tile('Debts total', 'Debts')).toBe('$350.00'))
    expect(await tile('Fixed monthly bills')).toBe('$2,035.00')

    fireEvent.click(await (await card('Bills')).findByRole('button', { name: 'Stop Phone from September' }))
    await waitFor(async () => expect(await tile('Bills total', 'Bills')).toBe('$1,600.00'))
    expect(await tile('Fixed monthly bills')).toBe('$1,950.00')
  })

  it('shows no tile under an empty card, and still counts the other two', async () => {
    const fake = seeded()
    fake.tables.categories = fake.tables.categories.filter((c) => c.id !== 'car-loan')
    renderScreen(<ListsTab />, fake)

    await waitFor(async () => expect(await tile('Bills total', 'Bills')).toBe('$1,685.00'))
    expect((await card('Debts')).getByText('Nothing here yet.')).toBeTruthy()
    expect((await card('Debts')).queryByText('Debts total')).toBeNull()
    expect(await tile('Fixed monthly bills')).toBe('$1,685.00')
  })

  it('shows no totals while an amount names a category that did not load', async () => {
    const fake = seeded()
    fake.tables.category_plans.push(plan('p9', 'gone', '2026-02', 5_000, 3))
    renderScreen(<ListsTab />, fake)

    await screen.findByRole('alert')
    expect(screen.queryByText('Bills total')).toBeNull()
    expect(screen.queryByText('Fixed monthly bills')).toBeNull()
  })
})
