import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAppData, type AppData } from '../src/app-data.js'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

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
    await expectNoAxeViolations()
  })

  // An AI app's addition (0020) waits like any other row, and says where it came from.
  it('says a row was added by an AI app, and no other row', async () => {
    const fake = seeded()
    fake.tables.ingest_candidates.push({
      id: 'p4', posted_on: '2026-03-12', amount_cents: -1250, merchant: 'Lunch at Subway', merchant_raw: 'Lunch at Subway', status: 'pending', source: 'ai_app',
    })
    renderScreen(<ReviewScreen />, fake)

    expect((await row('Lunch at Subway')).getByText(/Added by an AI app/)).toBeTruthy()
    expect(screen.getAllByText(/Added by an AI app/)).toHaveLength(1)
    await expectNoAxeViolations()
  })

  // The AI app's name from its grant, matched on the import's ai_client_id, which 0020 takes from the app's own token.
  it('names the AI app that added a row, while it is still connected', async () => {
    const fake = seeded()
    const ai = { posted_on: '2026-03-12', amount_cents: -1250, status: 'pending', source: 'ai_app' } as const
    fake.tables.ingest_candidates.push(
      { ...ai, id: 'p4', merchant: 'Lunch at Subway', merchant_raw: 'Lunch at Subway', batch_id: 'b-claude' },
      { ...ai, id: 'p5', merchant: 'Coffee', merchant_raw: 'Coffee', batch_id: 'b-gone' },
    )
    fake.tables.ingest_batches.push(
      { id: 'b-claude', source: 'ai_app', created_at: '2026-03-12T12:00:00Z', ai_client_id: 'id-claude' },
      { id: 'b-gone', source: 'ai_app', created_at: '2026-03-12T12:00:00Z', ai_client_id: 'id-disconnected' },
    )
    fake.oauth.grants = [{ client: { id: 'id-claude', name: 'Claude', uri: '', logo_uri: '' }, scopes: ['email'], granted_at: '2026-03-01T12:00:00Z' }]
    await fake.signIn()
    renderScreen(<ReviewScreen />, fake)

    expect(await (await row('Lunch at Subway')).findByText(/Added by Claude/)).toBeTruthy()
    expect((await row('Coffee')).getByText(/Added by an AI app/)).toBeTruthy()
  })

  it("groups the picker under the workbook's lists, each in its own order, then by name", async () => {
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
    const name = coffee.getByRole('textbox', { name: 'Name of the new category for SQ *LITWARE COFFEE' })
    await expectNoAxeViolations()
    fireEvent.change(name, { target: { value: '  Coffee  ' } })
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

  it('says the category may have gone on another device, not to sign out, when approving into it is refused (backend-b-08)', async () => {
    const fake = seeded()
    fake.fail('rpc/approve_candidate', '42501')
    renderScreen(<ReviewScreen />, fake)

    fireEvent.click((await row('CORNER MARKET #12')).getByRole('button', { name: /Approve/ }))

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That category, account or line is no longer there — it may have changed on another device. Reload this screen and try again; if it keeps happening, sign out and back in. Nothing was saved. (code 42501)')).toBeTruthy()
    expect(screen.getByText('CORNER MARKET #12')).toBeTruthy()
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

    // Removing a charge re-reads the screen once, through the app's refresh
    // (PERF-2). It is held.
    fireEvent.click(coffee.getByRole('button', { name: 'Not a real transaction — remove' }))
    await waitFor(() => expect(held).toBe(1))
    const dismiss = section.getByRole('button', { name: 'Dismiss row 11' })
    expect(dismiss).toHaveProperty('disabled', false)

    fireEvent.click(dismiss)
    await screen.findByRole('region', { name: '3 lines could not be read' })

    // The older read now answers, with row 11 still in it. It goes on to
    // read its imports; once it has, give the screen a turn to apply it.
    let answered = 0
    fake.server.afterRead = (table) => {
      if (table === 'ingest_batches') answered += 1
    }
    release()
    await waitFor(() => expect(answered).toBe(1))
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

    // 0012 says a line it cannot find with 42501, as on another device (backend-b-08).
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('That category, account or line is no longer there — it may have changed on another device. Reload this screen and try again; if it keeps happening, sign out and back in. Nothing was saved. (code 42501)')).toBeTruthy()
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

describe('ReviewScreen, a long queue (PERF-1)', () => {
  // Every card carries a category picker, and 240 of them froze the screen
  // for over a second, so the oldest 25 are drawn, and more on request.
  it('draws the oldest 25, and 25 more each time it is asked', async () => {
    const pending = Array.from({ length: 60 }, (_, i) => ({
      id: `q${i}`, posted_on: '2026-03-09', amount_cents: -(100 + i), merchant: `SHOP ${i}`, merchant_raw: `SHOP ${i}`, status: 'pending',
    }))
    renderScreen(<ReviewScreen />, createFakeSupabase({ ingest_candidates: pending }))

    await screen.findByText('SHOP 0')
    expect(screen.getAllByRole('combobox', { name: 'Category' })).toHaveLength(25)
    expect(screen.getByText('Showing the oldest 25 of 60.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show the next 25' }))
    expect(screen.getAllByRole('combobox', { name: 'Category' })).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: 'Show the last 10' }))
    expect(screen.getAllByRole('combobox', { name: 'Category' })).toHaveLength(60)
    expect(screen.queryByRole('button', { name: /^Show the/ })).toBeNull()
    expect(screen.queryByText(/^Showing the oldest/)).toBeNull()
  })

  it('moves focus to the first card it drew, as its button goes (PERF-10)', async () => {
    const pending = Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`, posted_on: '2026-03-09', amount_cents: -(100 + i), merchant: `SHOP ${i}`, merchant_raw: `SHOP ${i}`, status: 'pending',
    }))
    renderScreen(<ReviewScreen />, createFakeSupabase({ ingest_candidates: pending }))
    await screen.findByText('SHOP 0')

    const more = screen.getByRole('button', { name: 'Show the last 5' })
    more.focus()
    fireEvent.click(more)
    const first = (await screen.findByText('SHOP 25')).closest('li')!
    expect(document.activeElement).not.toBe(document.body)
    expect(first.contains(document.activeElement)).toBe(true)
  })
})

describe('ReviewScreen, what an approval asks the server (PERF-2)', () => {
  it('reads the queue once and its size once, and writes nothing but the approval', async () => {
    const fake = seeded()
    const asked: string[] = []
    fake.server.hold = (target) => {
      asked.push(target)
      return null
    }
    const count = (from: number, table: string) => asked.slice(from).filter((t) => t === table).length
    renderScreen(<ReviewScreen />, fake)
    const coffee = await row('SQ *LITWARE COFFEE')
    // Opening reads the queue twice (on mounting, and once the app's data
    // has loaded) and its size once. Every one of those asked, nothing
    // from opening is left to be counted as the approval's.
    await waitFor(() => expect([count(0, 'ingest_candidates'), count(0, 'merchant_rules'), count(0, 'ingest_unreadable_lines')]).toEqual([3, 2, 2]))
    const opened = asked.length

    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: 'c2' } })
    fireEvent.click(coffee.getByRole('button', { name: /Approve/ }))
    // Arrives with the approval's re-read, and only with a re-read begun
    // after it: once it shows, that re-read has been answered.
    fake.tables.ingest_candidates.push({ id: 'p9', posted_on: '2026-03-12', amount_cents: -500, merchant: 'LATE SHOP', merchant_raw: 'LATE SHOP', status: 'pending' })
    await screen.findByText('LATE SHOP')

    // The queue again, and its size for the tab's count: two reads, not the
    // three it took when the queue was read before and after the refresh.
    expect(count(opened, 'ingest_candidates')).toBe(2)
    expect(count(opened, 'ingest_unreadable_lines')).toBe(1)
    expect(asked.slice(opened).filter((t) => t.startsWith('POST') || t === 'accounts')).toEqual([])
    expect(fake.rpcCalls.map((c) => c.name)).toEqual(['approve_candidate'])
  })
})

describe('ReviewScreen, a read already out when a card is approved (CR-13)', () => {
  function Probe({ into }: { into: { current: AppData | null } }) {
    into.current = useAppData()
    return null
  }

  it('never draws the approved card again, even when an older read of the queue answers after it', async () => {
    const fake = seeded()
    const data: { current: AppData | null } = { current: null }
    renderScreen(<><ReviewScreen /><Probe into={data} /></>, fake)
    const market = await row('CORNER MARKET #12')
    await waitFor(() => expect(data.current?.status).toBe('ready'))

    // A reload of the queue is out, as after the previous approval, and
    // answers late: it lists the queue as it was when it was asked. The
    // refresh itself reads the queue's size first; its reload is the second.
    let releaseLoad = (): void => undefined
    let releaseRefresh = (): void => undefined
    let asked = 0
    let loadHeld = false
    let refreshHeld = false
    let approving = false
    fake.server.hold = (table) => {
      if (table === 'ingest_candidates' && !loadHeld && ++asked === 2) {
        loadHeld = true
        return new Promise<void>((resolve) => (releaseLoad = resolve))
      }
      // The approval's own refresh waits too, so the old read lands first.
      if (table === 'categories' && approving && !refreshHeld) {
        refreshHeld = true
        return new Promise<void>((resolve) => (releaseRefresh = resolve))
      }
      return null
    }
    void data.current?.refresh()
    await waitFor(() => expect(loadHeld).toBe(true))

    approving = true
    fireEvent.click(market.getByRole('button', { name: /Approve/ }))
    await screen.findByText(/^Added\./)
    await waitFor(() => expect(refreshHeld).toBe(true))
    expect(screen.queryByText('CORNER MARKET #12')).toBeNull()

    // From here on the card must not be drawn again, however briefly.
    let cameBack = false
    const watch = new MutationObserver(() => {
      if (screen.queryByText('CORNER MARKET #12') !== null) cameBack = true
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
    // Arrives only with a read asked after the approval, so once it shows,
    // the old read and the approval's refresh have both been answered.
    fake.tables.ingest_candidates.push({ id: 'p9', posted_on: '2026-03-12', amount_cents: -500, merchant: 'LATE SHOP', merchant_raw: 'LATE SHOP', status: 'pending' })
    // The old read is let go first. Whenever it lands, before the
    // approval's reload or after, the card must stay gone.
    releaseLoad()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    releaseRefresh()
    await screen.findByText('LATE SHOP')
    watch.disconnect()

    expect(cameBack).toBe(false)
    expect(screen.queryByText('CORNER MARKET #12')).toBeNull()
  })
  it('never draws a card filed by Approve these N again, when an older read answers after it', async () => {
    const fake = seeded()
    const data: { current: AppData | null } = { current: null }
    renderScreen(<><ReviewScreen /><Probe into={data} /></>, fake)
    const coffee = await row('SQ *LITWARE COFFEE')
    fireEvent.change(coffee.getByRole('combobox', { name: 'Category' }), { target: { value: 'c2' } })
    await waitFor(() => expect(data.current?.status).toBe('ready'))

    // As above: an older reload of the queue is out, and the approvals' refresh waits.
    let releaseLoad = (): void => undefined
    let releaseRefresh = (): void => undefined
    let asked = 0
    let loadHeld = false
    let refreshHeld = false
    let approving = false
    fake.server.hold = (table) => {
      if (table === 'ingest_candidates' && !loadHeld && ++asked === 2) {
        loadHeld = true
        return new Promise<void>((resolve) => (releaseLoad = resolve))
      }
      if (table === 'categories' && approving && !refreshHeld) {
        refreshHeld = true
        return new Promise<void>((resolve) => (releaseRefresh = resolve))
      }
      return null
    }
    void data.current?.refresh()
    await waitFor(() => expect(loadHeld).toBe(true))

    approving = true
    fireEvent.click(screen.getByRole('button', { name: 'Approve these 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve all 2' }))
    await screen.findByText(/^Filed 2\./)
    await waitFor(() => expect(refreshHeld).toBe(true))

    let cameBack = false
    const watch = new MutationObserver(() => {
      if (screen.queryByText('CORNER MARKET #12') !== null || screen.queryByText('SQ *LITWARE COFFEE') !== null) cameBack = true
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
    fake.tables.ingest_candidates.push({ id: 'p9', posted_on: '2026-03-12', amount_cents: -500, merchant: 'LATE SHOP', merchant_raw: 'LATE SHOP', status: 'pending' })
    releaseLoad()
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    releaseRefresh()
    await screen.findByText('LATE SHOP')
    watch.disconnect()

    expect(cameBack).toBe(false)
    expect(screen.queryByText('SQ *LITWARE COFFEE')).toBeNull()
  })
})

describe('ReviewScreen, in Mockup A (step 10)', () => {
  it("puts waiting's count and Approve these N on the title row, and each row's picker, Approve and ✕ on one line", async () => {
    const fake = seeded()
    fake.tables.merchant_rules.push({ match_merchant: 'LITWARE COFFEE', category_id: 'c2' })
    renderScreen(<ReviewScreen />, fake)

    const header = await screen.findByRole('banner')
    await within(header).findByRole('button', { name: 'Approve these 2' })
    // The count is the line under the title's number, drawn in waiting's amber; heard once.
    const count = within(header).getByText('3')
    expect([count.getAttribute('aria-hidden'), count.className.includes('bg-waiting-tile')]).toEqual(['true', true])
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Review')

    const coffee = await row('SQ *LITWARE COFFEE')
    const line = coffee.getByRole('combobox', { name: 'Category' }).parentElement!.parentElement!
    expect(line.className).toContain('min-[480px]:grid-cols-[minmax(0,1fr)_auto_auto]')
    expect(within(line).getByRole('button', { name: /Approve/ })).toBeTruthy()
    // Flat and 44px by prop: cn is a plain join, so an override would leave two shadows or sizes.
    const reject = within(line).getByRole('button', { name: 'Not a real transaction — remove' }).className.split(' ')
    expect([reject.includes('shadow-sm'), reject.filter((c) => /^size-/.test(c))]).toEqual([false, ['size-11']])
    // Opening the question still approves nothing.
    fireEvent.click(within(header).getByRole('button', { name: 'Approve these 2' }))
    expect(await screen.findByRole('group', { name: 'Approve these 2?' })).toBeTruthy()
    expect(fake.rpcCalls.map((c) => c.name)).not.toContain('approve_candidate')
  })

  it("draws the lines that could not be read in waiting's amber", async () => {
    const fake = seeded()
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_pdf', created_at: '2026-09-20T12:00:00+00:00' })
    fake.tables.ingest_unreadable_lines.push({ id: 'l1', batch_id: 'b1', source_line: 4, reason: 'missing_amount' })
    renderScreen(<ReviewScreen />, fake)

    const section = await screen.findByRole('region', { name: '1 line could not be read' })
    expect(['bg-waiting', 'border-waiting-border'].every((c) => section.className.split(' ').includes(c))).toBe(true)
    await expectNoAxeViolations()
  })
})
