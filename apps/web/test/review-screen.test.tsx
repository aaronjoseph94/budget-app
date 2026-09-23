import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

function seeded(): FakeSupabase {
  return createFakeSupabase({
    categories: [
      { id: 'c1', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'c2', name: 'Eating out', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    ],
    ingest_candidates: [
      { id: 'p1', posted_on: '2026-03-09', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'SQ *LITWARE COFFEE', status: 'pending' },
      { id: 'p2', posted_on: '2026-03-10', amount_cents: -6412, merchant: 'CORNER MARKET', merchant_raw: 'CORNER MARKET #12', status: 'pending' },
      { id: 'p3', posted_on: '2026-03-11', amount_cents: 2500, merchant: 'ADVENTURE WORKS', merchant_raw: 'ADVENTURE WORKS REFUND', status: 'pending' },
      { id: 'x1', posted_on: '2026-03-08', amount_cents: -999, merchant: 'CONTOSO FUEL', merchant_raw: 'CONTOSO FUEL', status: 'approved' },
    ],
    // Filed before: the screen should suggest Groceries, not approve it.
    merchant_rules: [{ match_merchant: 'CORNER MARKET', category_id: 'c1' }],
  })
}

/** One queue row, found by the merchant text it shows. */
async function row(merchantRaw: string) {
  const item = (await screen.findByText(merchantRaw)).closest('li')
  if (!(item instanceof HTMLElement)) throw new Error(`no row for ${merchantRaw}`)
  return within(item)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('ReviewScreen', () => {
  it('lists what is waiting, with amounts and the suggestion from a learned rule', async () => {
    renderScreen(<ReviewScreen />, seeded())

    expect(await screen.findByText(/3 waiting for a category\./)).toBeTruthy()
    expect(screen.queryByText('CONTOSO FUEL')).toBeNull()

    const coffee = await row('SQ *LITWARE COFFEE')
    expect(coffee.getByText('-$13.49')).toBeTruthy()
    expect(coffee.getByRole('button', { name: /Approve/ })).toHaveProperty('disabled', true)

    const market = await row('CORNER MARKET #12')
    expect(market.getByRole<HTMLSelectElement>('combobox', { name: 'Category' }).value).toBe('c1')
    expect(market.getByText('Suggested')).toBeTruthy()
    expect((await row('ADVENTURE WORKS REFUND')).getByText('$25.00')).toBeTruthy()
  })

  it("groups the picker under Workbook's lists, each in its own order, then by name", async () => {
    const fake = seeded()
    fake.tables.categories.push(
      { id: 'c3', name: 'Rent', kind: 'bill', sort_order: 1, weekly_budget_cents: null },
      { id: 'c4', name: 'Water', kind: 'bill', sort_order: 0, weekly_budget_cents: null },
      { id: 'c5', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
      { id: 'c6', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
    )
    renderScreen(<ReviewScreen />, fake)

    const picker = (await row('SQ *LITWARE COFFEE')).getByRole('combobox', { name: 'Category' })
    await waitFor(() => expect(picker.querySelectorAll('optgroup')).toHaveLength(4))
    const groups = [...picker.querySelectorAll('optgroup')].map((g) => [
      g.label,
      [...g.querySelectorAll('option')].map((o) => o.textContent),
    ])
    expect(groups).toEqual([
      ['Income', ['Pay']],
      ['Bills', ['Water', 'Rent']],
      ['Variable expenses', ['Eating out', 'Groceries']],
      ['Not spending', ['Card payments']],
    ])
  })

  it('approves into the chosen category through approve_candidate', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: 'c2' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))

    expect(await screen.findByText(/^Added\./)).toBeTruthy()
    expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p1', p_category: 'c2' } }])
  })

  it('approves a suggested row into the suggested category', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    await waitFor(() =>
      expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p2', p_category: 'c1' } }]),
    )
  })

  it('creates a new category first, then approves into it', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
    fireEvent.change(coffee.getByPlaceholderText(/Category name/), { target: { value: '  Coffee  ' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))

    await screen.findByText(/^Added\./)
    // A charge defaults to Variable expenses, at the bottom of that list.
    const created = fake.tables.categories.find((c) => c.name === 'Coffee')
    expect(created).toMatchObject({ kind: 'variable', sort_order: 1 })
    expect(fake.rpcCalls).toEqual([{ name: 'approve_candidate', args: { p_candidate: 'p1', p_category: created?.id } }])
  })

  it('asks which list for money in, and files the new category there', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const refund = await row('ADVENTURE WORKS REFUND')
    fireEvent.change(refund.getByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
    fireEvent.change(refund.getByPlaceholderText(/Category name/), { target: { value: 'Card payments' } })
    const list = refund.getByRole<HTMLSelectElement>('combobox', { name: 'Which list' })
    expect(list.value).toBe('')
    expect(refund.getByRole('button', { name: /Approve/ })).toHaveProperty('disabled', true)

    fireEvent.change(list, { target: { value: 'transfer' } })
    fireEvent.click(refund.getByRole('button', { name: /Approve/ }))

    await screen.findByText(/^Added\./)
    expect(fake.tables.categories.find((c) => c.name === 'Card payments')).toMatchObject({ kind: 'transfer', sort_order: 0 })
  })

  it('refuses a new name that is already on another list, in words', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: '__new__' } })
    fireEvent.change(coffee.getByPlaceholderText(/Category name/), { target: { value: 'Groceries' } })
    fireEvent.change(coffee.getByRole('combobox', { name: 'Which list' }), { target: { value: 'bill' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('You already have “Groceries” in Variable expenses. Choose it from the list, or use another name.'),
    ).toBeTruthy()
    expect(fake.rpcCalls).toEqual([])
  })

  it('says so when the charge was already in the ledger', async () => {
    const fake = seeded()
    fake.rpcReplies.approve_candidate = 'already_in_ledger'
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    expect(await screen.findByText('You already had that one, so nothing was added.')).toBeTruthy()
  })

  it('removes a row through reject_candidate', async () => {
    const fake = seeded()
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('ADVENTURE WORKS REFUND')).getByRole('button', { name: /remove/ }))

    expect(await screen.findByText('Removed from the queue. It will not be counted.')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([{ name: 'reject_candidate', args: { p_candidate: 'p3' } }])
  })

  it('shows a readable message when approving fails, and keeps the queue', async () => {
    const fake = seeded()
    fake.fail('rpc/approve_candidate', '28000')
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That did not work')).toBeTruthy()
    expect(
      within(alert).getByText('You are not signed in any more. Sign in again and retry — nothing was saved. (code 28000)'),
    ).toBeTruthy()
    expect(screen.getByText('CORNER MARKET #12')).toBeTruthy()
    expect(screen.queryByText(/^Added\./)).toBeNull()
  })

  it('shows a readable message when the queue cannot be loaded', async () => {
    const fake = seeded()
    fake.fail('merchant_rules', '42501')
    renderScreen(<ReviewScreen />, fake)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'),
    ).toBeTruthy()
  })
})

describe('ReviewScreen, lines an import could not read', () => {
  const withLines = () => {
    const fake = seeded()
    fake.tables.ingest_batches.push(
      { id: 'b-old', source: 'card_csv', created_at: '2026-07-01T12:00:00+00:00' },
      { id: 'b-pdf', source: 'card_pdf', created_at: '2026-09-20T12:00:00+00:00' },
      { id: 'b-clean', source: 'card_csv', created_at: '2026-09-21T12:00:00+00:00' },
    )
    fake.tables.ingest_unreadable_lines.push(
      { id: 'l-old', batch_id: 'b-old', source_line: 5, reason: 'missing_date' },
      { id: 'l-11', batch_id: 'b-pdf', source_line: 11, reason: 'invalid_merchant' },
      { id: 'l-2', batch_id: 'b-pdf', source_line: 2, reason: 'missing_amount' },
      { id: 'l-3', batch_id: 'b-pdf', source_line: 3, reason: 'unparseable_amount' },
      { id: 'l-done', batch_id: 'b-pdf', source_line: 7, reason: 'missing_date', dismissed_at: '2026-09-21T09:00:00+00:00' },
    )
    return fake
  }

  it('lists every line not dismissed, however old, newest import first and in line order', async () => {
    renderScreen(<ReviewScreen />, withLines())

    const section = within(await screen.findByRole('region', { name: '4 lines could not be read' }))
    expect(section.getAllByText(/^Card statement/).map((p) => p.textContent)).toEqual([
      'Card statement (PDF) · imported 20 Sep 2026',
      'Card statement (CSV) · imported 1 Jul 2026',
    ])
    expect(section.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Row 2This row had no amount.Dismiss',
      'Row 3The amount could not be read as money in the format you chose.Dismiss',
      'Row 11The description contained characters that could display as something other than what is stored.Dismiss',
      'Line 5This row had no date.Dismiss',
    ])
    // The queue is still there alongside it.
    expect(await screen.findByText(/3 waiting for a category\./)).toBeTruthy()
  })

  it('shows a stored code only through describeReason, never as markup', async () => {
    const fake = seeded()
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_csv', created_at: '2026-09-20T12:00:00+00:00' })
    fake.tables.ingest_unreadable_lines.push({ id: 'l1', batch_id: 'b1', source_line: 4, reason: '<img src=x onerror=alert(1)>' })
    const { container } = renderScreen(<ReviewScreen />, fake)

    const section = within(await screen.findByRole('region', { name: '1 line could not be read' }))
    expect(section.getByRole('listitem').textContent).toBe('Line 4This row could not be read.Dismiss')
    expect(container.querySelector('img')).toBeNull()
  })

  it('says how many there are when not all of them fit', async () => {
    const fake = seeded()
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_csv', created_at: '2026-09-20T12:00:00+00:00' })
    for (let line = 1; line <= 201; line += 1) {
      fake.tables.ingest_unreadable_lines.push({ id: `l${line}`, batch_id: 'b1', source_line: line, reason: 'missing_date' })
    }
    renderScreen(<ReviewScreen />, fake)

    const section = within(await screen.findByRole('region', { name: '201 lines could not be read' }))
    expect(section.getAllByRole('listitem')).toHaveLength(200)
    expect(section.getByText('Showing 200 of 201.')).toBeTruthy()
  })

  it('shows nothing about unreadable lines, and says all caught up, when there are none', async () => {
    const fake = createFakeSupabase({
      ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00+00:00' }],
    })
    renderScreen(<ReviewScreen />, fake)

    expect(await screen.findByText('All caught up')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
    // Not a dead end: what was just approved is on the Month.
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'See this month' }))
    expect(window.location.hash).toBe('#/month')
  })

  it('shows a readable message when the lines cannot be loaded', async () => {
    const fake = withLines()
    fake.fail('ingest_unreadable_lines', '42501')
    renderScreen(<ReviewScreen />, fake)

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'),
    ).toBeTruthy()
    // The charges waiting are still there to categorise.
    expect(await screen.findByText(/3 waiting for a category\./)).toBeTruthy()
  })

  it('dismisses one line through dismiss_unreadable_line, one at a time', async () => {
    const fake = withLines()
    renderScreen(<ReviewScreen />, fake)

    const before = within(await screen.findByRole('region', { name: '4 lines could not be read' }))
    fireEvent.click(before.getByRole('button', { name: 'Dismiss row 11' }))
    // Until the list is read again, no other line can be dismissed in its place.
    expect(before.getByRole('button', { name: 'Dismiss row 2' })).toHaveProperty('disabled', true)

    expect(await screen.findByText('Dismissed. That line will not show here again.')).toBeTruthy()
    const after = within(await screen.findByRole('region', { name: '3 lines could not be read' }))
    expect(after.getAllByRole('listitem').map((li) => li.firstChild?.textContent)).toEqual(['Row 2', 'Row 3', 'Line 5'])
    expect(after.getByRole('button', { name: 'Dismiss row 2' })).toHaveProperty('disabled', false)
    expect(fake.rpcCalls).toEqual([{ name: 'dismiss_unreadable_line', args: { p_line: 'l-11' } }])
  })

  it('does not bring a dismissed line back when a read begun before the dismissal answers after it', async () => {
    const fake = withLines()
    renderScreen(<ReviewScreen />, fake)
    const section = within(await screen.findByRole('region', { name: '4 lines could not be read' }))
    const coffee = await row('SQ *LITWARE COFFEE')

    // A slow connection: each read of the lines begun before the dismissal is
    // held back, and when it does answer it lists them as they were then.
    let release = (): void => undefined
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = 0
    fake.server.hold = (table) => {
      if (table !== 'ingest_unreadable_lines' || fake.rpcCalls.some((c) => c.name === 'dismiss_unreadable_line')) {
        return null
      }
      held += 1
      return released
    }

    // Removing a charge re-reads the screen twice: once itself, and once for
    // the app's refresh. Both are held.
    fireEvent.click(coffee.getByRole('button', { name: 'Not a real transaction — remove' }))
    await waitFor(() => expect(held).toBe(2))
    const dismiss = section.getByRole('button', { name: 'Dismiss row 11' })
    expect(dismiss).toHaveProperty('disabled', false)

    fireEvent.click(dismiss)
    await screen.findByRole('region', { name: '3 lines could not be read' })

    // The two older reads now answer, with row 11 still in them. Each goes on
    // to read its imports; once both have, give the screen a turn to apply them.
    let answered = 0
    fake.server.afterRead = (table) => {
      if (table === 'ingest_batches') answered += 1
    }
    release()
    await waitFor(() => expect(answered).toBe(2))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(screen.getByRole('region', { name: '3 lines could not be read' })).toBeTruthy()
    expect(section.queryByRole('button', { name: 'Dismiss row 11' })).toBeNull()
  })

  it('keeps the line, and says why, when dismissing fails', async () => {
    const fake = withLines()
    fake.fail('rpc/dismiss_unreadable_line', '42501')
    renderScreen(<ReviewScreen />, fake)

    const section = within(await screen.findByRole('region', { name: '4 lines could not be read' }))
    fireEvent.click(section.getByRole('button', { name: 'Dismiss line 5' }))

    const alert = await screen.findByRole('alert')
    expect(
      within(alert).getByText('Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)'),
    ).toBeTruthy()
    expect(section.getByRole('button', { name: 'Dismiss line 5' })).toHaveProperty('disabled', false)
    expect(screen.queryByText(/^Dismissed\./)).toBeNull()
  })

  it('says all caught up once the last line is dismissed', async () => {
    const fake = createFakeSupabase({
      ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00+00:00' }],
      ingest_unreadable_lines: [{ id: 'l1', batch_id: 'b1', source_line: 4, reason: 'missing_amount' }],
    })
    renderScreen(<ReviewScreen />, fake)

    const section = within(await screen.findByRole('region', { name: '1 line could not be read' }))
    fireEvent.click(section.getByRole('button', { name: 'Dismiss row 4' }))

    expect(await screen.findByText('All caught up')).toBeTruthy()
    expect(screen.queryByRole('region')).toBeNull()
  })
})
