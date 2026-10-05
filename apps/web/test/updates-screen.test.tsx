import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { PUBLIC_KEY, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'
import { UPDATES } from '../src/help/updates.js'

/** How many steps the list has, so adding an update does not move every heading below. */
const ALL = UPDATES.length
const ONE_LEFT = `${ALL - 1} of ${ALL} in`

beforeAll(() => warmScreen('#/help/updates', 'One-time updates'))

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  act(() => {
    window.location.hash = '#/help/updates'
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.location.hash = ''
})

/** Every step done: signed in with Supabase's new key, sign-in for AI apps on, and the browser's own fetch reaching the fake. */
async function ready(alg = 'ES256'): Promise<FakeSupabase> {
  const fake = createFakeSupabase()
  await fake.signIn(alg)
  fake.oauth.grants = []
  vi.stubGlobal('fetch', fake.fetch)
  // The public values the page is built with, which the sign-ups check sends.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', PUBLIC_KEY)
  return fake
}

/** The row for a file, as a reader hears it: "Not in yet: 0008_…". */
const row = (file: string) => screen.getByText(file, { selector: 'li span' }).closest('li')?.textContent

/** The next step's clicks, in order, and the GitHub links beside them. */
const clicks = () => [...document.querySelectorAll('[aria-labelledby="updates-status"] ol > li')].map((li) => li.textContent)
const githubLinks = () => screen.queryAllByRole('link', { name: /on GitHub$/ }).map((a) => a.textContent)

async function open(fake: FakeSupabase, status: string) {
  renderScreen(<Shell />, fake)
  await screen.findByRole('heading', { level: 1, name: 'One-time updates' })
  await screen.findByRole('heading', { level: 2, name: status })
}

describe('One-time updates', () => {
  it('says all done, with a ✓ on each, when everything is in', async () => {
    await open(await ready(), 'All done')
    expect(row('0005_category_kinds.sql')).toBe('✓In: 0005_category_kinds.sqlWhich list each category is on')
    expect(screen.getAllByText('✓')).toHaveLength(ALL)
    expect(screen.queryByText(/^Next: paste/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Check again' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('names a table not there (PGRST205) as the next file to paste, with where to find it', async () => {
    const fake = await ready()
    fake.fail('category_budgets', 'PGRST205')
    await open(fake, ONE_LEFT)
    expect(row('0008_category_budgets.sql')).toContain('✗Not in yet: ')
    expect(screen.getByText(/^Next: paste/).textContent).toBe(
      'Next: paste 0008_category_budgets.sql, then each file after it in number order, one at a time.',
    )
    const link = screen.getByRole('link', { name: 'Open 0008_category_budgets.sql on GitHub' })
    expect(link.getAttribute('href')).toBe('https://github.com/aaronjoseph94/budget-app/blob/main/supabase/migrations/0008_category_budgets.sql')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('reads 42P01 from an older server as a table not there', async () => {
    const fake = await ready()
    fake.fail('debts', '42P01')
    await open(fake, ONE_LEFT)
    expect(row('0014_debts.sql')).toContain('Not in yet')
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0014_debts.sql')
  })

  it('reads PGRST202 as a function not there', async () => {
    const fake = await ready()
    delete fake.rpcReplies['dismiss_unreadable_line']
    await open(fake, ONE_LEFT)
    expect(row('0012_dismiss_unreadable_lines.sql')).toContain('Not in yet')
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0012_dismiss_unreadable_lines.sql')
  })

  it('still opens when 0005 is missing and the app cannot load, and starts at 0003', async () => {
    const fake = await ready()
    fake.server.refuse = (table, query) => (table === 'categories' && query.get('select')?.includes('kind') === true ? '42703' : null)
    await open(fake, ONE_LEFT)
    expect(screen.getByText('Could not load your data')).toBeTruthy()
    // Already here, so the alert does not send the owner here again.
    expect(screen.queryByRole('link', { name: 'Check the one-time updates' })).toBeNull()
    expect(screen.getByText(/^Next: paste/).textContent).toContain('0003_save_import_atomically.sql')
    expect(screen.getByText(/^0003_save_import_atomically\.sql is the first/)).toBeTruthy()
  })

  it('names sign-ups first when they are on, with the dashboard clicks and no Copy or GitHub link (backend-b-06)', async () => {
    const fake = await ready()
    fake.server.signupsOff = false
    await open(fake, ONE_LEFT)
    expect(row('Sign-ups off')).toBe('✗Not in yet: Sign-ups offStops anyone who finds the site making an account')
    expect(screen.getByText('Next: stop strangers making an account. About 2 minutes, on a computer.')).toBeTruthy()
    expect(clicks()).toEqual([
      'In Supabase, open Authentication, then Sign In / Providers. On an older dashboard it is Authentication, then Providers, then Email, or Authentication, then Settings.',
      'Turn off Allow new users to sign up, and press Save.',
      'Open Authentication, then Users, and delete any row that is not you.',
      'Press Check again.',
    ])
    expect(screen.queryByRole('link', { name: /on GitHub/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull()
  })

  it('names the AI helper next when only it is missing, with the Edge Functions clicks', async () => {
    const fake = await ready()
    fake.functions.ai = null
    await open(fake, ONE_LEFT)
    expect(row('ai-function.ts')).toBe('✗Not in yet: ai-function.tsThe AI helper, which every AI feature goes through')
    expect(screen.getByText('Next: install the AI helper. About 5 minutes, easiest on a computer.')).toBeTruthy()
    expect(screen.getByText('Name it exactly ai.')).toBeTruthy()
    const link = screen.getByRole('link', { name: 'Open the AI helper on GitHub' })
    expect(link.getAttribute('href')).toBe('https://github.com/aaronjoseph94/budget-app/blob/main/supabase/functions/ai/index.ts')
  })

  // Security review mcp-3-03: an older read-receipt is a step of its own, after the helper.
  it('names an older read-receipt next, to delete or replace, with its Copy', async () => {
    const fake = await ready()
    fake.functions.readReceipt = () => new Response('{}')
    fake.functions.readReceiptVersion = () => new Response(JSON.stringify({ ok: false, code: 'method_not_allowed' }), { status: 405 })
    await open(fake, ONE_LEFT)
    expect(row('read-receipt')).toBe('✗An older copy: read-receiptDeleted, or its new version: the AI helper reads receipts without it: an older copy is in')
    expect(screen.getByText('Next: delete read-receipt, or paste its new version over it. About 2 minutes, on a computer.')).toBeTruthy()
    expect(clicks()).toEqual([
      'In Supabase, open Edge Functions, then read-receipt, then its ⋯ menu, and press Delete.',
      'Or, to keep it, open its code, paste its new version over everything with Copy below, and deploy it.',
    ])
  })

  it('names the AI apps server last, with its clicks: JWT verification off, and no GitHub link', async () => {
    const fake = await ready()
    fake.functions.mcpHealth = null
    await open(fake, ONE_LEFT)
    expect(row('mcp-function.ts')).toBe('✗Not in yet: mcp-function.tsThe AI apps server, which Claude or ChatGPT connect to')
    expect(screen.getByText('Name it exactly mcp.')).toBeTruthy()
    expect(screen.getByText('Turn Enforce JWT verification off, and press Deploy. The server checks every caller itself.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: /on GitHub$/ })).toBeNull()
    fake.functions.mcpHealth = () => new Response(JSON.stringify({ ok: true, version: '2026-09-29.1' }), { headers: { 'content-type': 'application/json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    // Greyed while it checks, never disabled, which drops focus (FE-6, e2e-setup-01).
    const checking = screen.getByRole<HTMLButtonElement>('button', { name: 'Checking…' })
    expect([checking.disabled, checking.getAttribute('aria-disabled')]).toEqual([false, 'true'])
    await screen.findByText('Open its settings and check Enforce JWT verification is still off.')
  })

  // ChatGPT's sign-in needs Supabase's new key (PLAN §1, step 3): each helper's gateway check comes off first.
  it('names the signing key after the AI helper, with its clicks, and keeps the helper’s JWT check on only with the old key', async () => {
    const fake = await ready('HS256')
    await open(fake, ONE_LEFT)
    expect(row('Signing key')).toBe('✗Not in yet: Signing keyThe key Supabase signs your sign-in with, which ChatGPT needs')
    expect(screen.getByText(/^Next: move Supabase to its new signing key/)).toBeTruthy()
    // read-receipt's older copy relies on the gateway alone, so it is replaced or deleted before its switch comes off.
    expect(clicks()).toEqual([
      'In Supabase, open Edge Functions, then the function named ai, then its settings. Turn Enforce JWT verification off, and save.',
      'If Edge Functions lists read-receipt, first paste its new version over it with Copy read-receipt below, or delete it: its older copy relies on that switch alone, and with it off anyone could use your Gemini key. Then turn its switch off the same way.',
      'Open Project Settings, then JWT Keys, and press Rotate keys, so the current key is the ECC (P-256) one. Do not revoke the old key.',
      'Sign out of this app and back in, then press Check again.',
    ])
    expect(githubLinks()).toEqual(['Open read-receipt on GitHub'])
    fake.functions.ai = null
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Keep Enforce JWT verification on, and press Deploy.')).toBeTruthy()

    cleanup()
    const later = await ready()
    later.functions.ai = () => new Response(JSON.stringify({ ok: true, version: '2026-09-25.1' }), { headers: { 'content-type': 'application/json' } })
    await open(later, ONE_LEFT)
    expect(screen.getByText('Turn Enforce JWT verification off, and deploy it.')).toBeTruthy()
  })

  it('names sign-in for AI apps before the server, with its clicks and this site as Site URL', async () => {
    const fake = await ready()
    fake.oauth.grants = null
    await open(fake, ONE_LEFT)
    expect(row('Sign-in for AI apps')).toBe('✗Not in yet: Sign-in for AI appsLets Claude or ChatGPT ask you to allow them')
    expect(clicks()).toEqual([
      `In Supabase, open Authentication, then URL Configuration, and check Site URL is ${window.location.origin}.`,
      'Open Authentication, then OAuth Server, and press Enable.',
      'Set Authorization Path to /oauth/consent.',
      'Turn on dynamic client registration, which lets Claude and ChatGPT register themselves, and press Save.',
      'Under Sign In / Providers, keep Allow new users to sign up off, and under Email keep Secure email change on.',
    ])
    expect(githubLinks()).toEqual([])
  })

  it('asks for the helper’s new version over an older copy, with the clicks for replacing it', async () => {
    const fake = await ready()
    fake.functions.ai = () => new Response(JSON.stringify({ ok: true, version: '2026-09-25.1' }), { headers: { 'content-type': 'application/json' } })
    await open(fake, ONE_LEFT)
    expect(row('ai-function.ts')).toBe('✗An older copy: ai-function.tsThe AI helper, which every AI feature goes through: an older copy is in')
    expect(screen.getByText('Next: paste the AI helper’s new version over the one you have. About 5 minutes, easiest on a computer.')).toBeTruthy()
    expect(screen.getByText('Paste the new version over everything in the editor.')).toBeTruthy()
    expect(screen.queryByText('Name it exactly ai.')).toBeNull()
  })

  it('says it could not check, and to check again, rather than calling anything missing', async () => {
    const fake = await ready()
    fake.fail('month_balances', 'PGRST301')
    await open(fake, ONE_LEFT)
    expect(row('0010_month_balances.sql')).toContain('?Could not check: ')
    expect(screen.getByText('Some could not be checked. Check your connection, then press Check again.')).toBeTruthy()
  })

  it('checks again when asked, and shows what is in now', async () => {
    const fake = await ready()
    fake.fail('pay_schedules', 'PGRST205')
    await open(fake, ONE_LEFT)
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
