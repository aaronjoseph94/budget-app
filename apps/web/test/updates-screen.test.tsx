import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  act(() => {
    window.location.hash = '#/help/updates'
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.location.hash = ''
})

/** The row for a file, as a reader hears it: "Not in yet: 0008_…". */
const row = (file: string) => screen.getByText(file, { selector: 'li span' }).closest('li')?.textContent

async function open(fake: FakeSupabase, status: string) {
  renderScreen(<Shell />, fake)
  await screen.findByRole('heading', { level: 1, name: 'One-time updates' })
  await screen.findByRole('heading', { level: 2, name: status })
}

describe('One-time updates', () => {
  it('says all done, with a ✓ on each, when everything is in', async () => {
    await open(createFakeSupabase(), 'All done')
    expect(row('0005_category_kinds.sql')).toBe('✓In: 0005_category_kinds.sqlWhich list each category is on')
    expect(screen.getAllByText('✓')).toHaveLength(13)
    expect(screen.queryByText(/^Next: paste/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
  })

  it('names a table not there (PGRST205) as the next file to paste, with where to find it', async () => {
    const fake = createFakeSupabase()
    fake.fail('category_budgets', 'PGRST205')
    await open(fake, '12 of 13 in')
    expect(row('0008_category_budgets.sql')).toContain('✗Not in yet: ')
    expect(screen.getByText(/^Next: paste/).textContent).toBe(
      'Next: paste 0008_category_budgets.sql, then each file after it in number order, one at a time.',
    )
    const link = screen.getByRole('link', { name: 'Open 0008_category_budgets.sql on GitHub' })
    expect(link.getAttribute('href')).toBe('https://github.com/aaronjoseph94/budget-app/blob/main/supabase/migrations/0008_category_budgets.sql')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('reads 42P01 from an older server as a table not there', async () => {
    const fake = createFakeSupabase()
    fake.fail('debts', '42P01')
    await open(fake, '12 of 13 in')
    expect(row('0014_debts.sql')).toContain('Not in yet')
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0014_debts.sql')
  })

  it('reads PGRST202 as a function not there', async () => {
    const fake = createFakeSupabase()
    delete fake.rpcReplies['dismiss_unreadable_line']
    await open(fake, '12 of 13 in')
    expect(row('0012_dismiss_unreadable_lines.sql')).toContain('Not in yet')
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0012_dismiss_unreadable_lines.sql')
  })

  it('still opens when 0005 is missing and the app cannot load, and starts at 0003', async () => {
    const fake = createFakeSupabase()
    fake.server.refuse = (table, query) => (table === 'categories' && query.get('select')?.includes('kind') === true ? '42703' : null)
    await open(fake, '12 of 13 in')
    expect(screen.getByText('Could not load your data')).toBeTruthy()
    // Already here, so the alert does not send the owner here again.
    expect(screen.queryByRole('link', { name: 'Check the one-time updates' })).toBeNull()
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0003_save_import_atomically.sql')
    expect(screen.getByText(/^0003_save_import_atomically\.sql is the first/)).toBeTruthy()
  })

  it('names the AI helper next when only it is missing, with the Edge Functions clicks', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    await open(fake, '12 of 13 in')
    expect(row('ai-function.ts')).toBe('✗Not in yet: ai-function.tsThe AI helper, which every AI feature goes through')
    expect(screen.getByText('Next: install the AI helper. About 5 minutes, easiest on a computer.')).toBeTruthy()
    expect(screen.getByText('Name it exactly ai.')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Open the AI helper on GitHub' })
    expect(link.getAttribute('href')).toBe('https://github.com/aaronjoseph94/budget-app/blob/main/supabase/functions/ai/index.ts')
  })

  it('says it could not check, and to check again, rather than calling anything missing', async () => {
    const fake = createFakeSupabase()
    fake.fail('month_balances', 'PGRST301')
    await open(fake, '12 of 13 in')
    expect(row('0010_month_balances.sql')).toContain('?Could not check: ')
    expect(screen.getByText('Some could not be checked. Check your connection, then press Check again.')).toBeTruthy()
  })

  it('checks again when asked, and shows what is in now', async () => {
    const fake = createFakeSupabase()
    fake.fail('pay_schedules', 'PGRST205')
    await open(fake, '12 of 13 in')
    fake.heal('pay_schedules')
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'All done' })).toBeTruthy()
    expect(within(screen.getByRole('article')).queryByText('✗')).toBeNull()
  })
})

describe('when the first read fails on another screen', () => {
  it('points to One-time updates beside Try again', async () => {
    const fake = createFakeSupabase()
    fake.fail('categories', 'PGRST205')
    act(() => {
      window.location.hash = '#/month'
    })
    renderScreen(<Shell />, fake)
    const link = await screen.findByRole('link', { name: 'Check the one-time updates' })
    expect(link.getAttribute('href')).toBe('#/help/updates')
  })
})
