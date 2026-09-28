import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { GettingStartedScreen } from '../src/screens/GettingStartedScreen.js'
import { NO_MARKS, type SetupMarks } from '../src/profile.js'
import type { Category } from '../src/ledger.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/**
 * Getting started (plan §8.1, A25): one step per screen, whether each is
 * done read from the data, Do this later kept in the sign-in. Names and
 * amounts are invented.
 */

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

const category = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })

/** An owner with every step done but the name, AI switched off by their own choice. */
function allButName(): FakeSupabase {
  const fake = createFakeSupabase({
    categories: [category('pay', 'Day job', 'income'), category('food', 'Groceries', 'variable'), category('rent', 'Rent', 'bill')],
    pay_schedules: [{ id: 's1', category_id: 'pay', first_pay_date: '2026-09-04', frequency: 'biweekly' }],
    category_plans: [{ id: 'p1', category_id: 'rent', effective_month: '2026-09-01', planned_cents: 150_000, due_day: 1 }],
    savings_goals: [
      { id: 'g1', name: 'Rainy day', target_cents: 500_000, saved_cents: 20_000, target_date: null, unit_cost_cents: null, unit_label: null },
    ],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-02T10:00:00Z' }],
    month_balances: [{ id: 'm1', month: '2026-09-01', starting_balance_cents: 240_000 }],
  })
  fake.functions.aiStatus = aiStatusReply({ enabled: false })
  return fake
}

function renderStart(fake: FakeSupabase, { name = '', marks = NO_MARKS }: { name?: string; marks?: SetupMarks } = {}) {
  return render(
    <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" displayName={name} setupMarks={marks}>
      <GettingStartedScreen />
    </AppDataProvider>,
  )
}

const continueOn = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

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

describe('Getting started (plan §8.1)', () => {
  it('opens on the first step not done, saying where it is and how long it takes', async () => {
    renderStart(createFakeSupabase())

    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 9 · under a minute')).toBeTruthy()
    expect(screen.getByText('Not done yet')).toBeTruthy()
    expect(screen.getByText(/Nothing breaks if you stop here/)).toBeTruthy()
  })

  it('walks the steps with Continue, each read from its title', async () => {
    renderStart(createFakeSupabase())
    await screen.findByRole('heading', { name: 'Your name' })

    continueOn()
    expect(screen.getByRole('heading', { name: 'Your lists' })).toBe(document.activeElement)
    expect(screen.getByText('Step 2 of 9 · about 2 minutes')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Setup' }).getAttribute('href')).toBe('#/setup')
  })

  it('sends a step to the end with Do this later, kept in the sign-in, and lists all nine to jump to', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    renderStart(fake)
    await screen.findByRole('heading', { name: 'Your name' })

    continueOn()
    fireEvent.click(screen.getByRole('button', { name: 'Do this later' }))

    expect(await screen.findByRole('heading', { name: 'When you’re paid' })).toBeTruthy()
    expect(fake.user.user_metadata['setup_later']).toEqual(['lists'])
    // Lists is now the ninth step, and pay the second.
    expect(screen.getByText('Step 2 of 9 · about 1 minute')).toBeTruthy()
    const all = within(screen.getByText(/^All 9 steps/).closest('details')!)
    expect(all.getAllByRole('button').map((b) => b.textContent?.replace(/:.*$/, ''))).toEqual([
      '·Your name', '·When you’re paid', '·Your bills', '·Your savings goals', '·Your first statement',
      '·This month’s starting balance', '·Turn on free AI', '·Put it on your iPhone', '·Your lists',
    ])
    fireEvent.click(all.getByRole('button', { name: /Your savings goals/ }))
    expect(screen.getByRole('heading', { name: 'Your savings goals' })).toBe(document.activeElement)
  })

  it('keeps the step where it was, and says so, when Do this later cannot be saved', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    fake.fail('auth/user', '500')
    renderStart(fake)
    await screen.findByRole('heading', { name: 'Your name' })

    fireEvent.click(screen.getByRole('button', { name: 'Do this later' }))

    expect(await screen.findByText('That was not saved. Check your connection and try again.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Your name' })).toBeTruthy()
  })

  it('says a step it could not read is can’t check yet, never done, and points to One-time updates', async () => {
    const fake = allButName()
    fake.fail('pay_schedules', '42P01')
    renderStart(fake)
    await screen.findByRole('heading', { name: 'Your name' })

    continueOn()
    continueOn()

    expect(await screen.findByText('Can’t check this yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.getByLabelText('6 of 9 done')).toBeTruthy()
  })

  it('ends past the last step with how many are done, and the way back', async () => {
    renderStart(allButName(), { name: 'Alex' })

    // Only the iPhone step is left, so it opens there, as the ninth.
    expect(await screen.findByRole('heading', { name: 'Put it on your iPhone' })).toBeTruthy()
    expect(screen.getByText('Step 9 of 9 · about 1 minute')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))

    expect(screen.getByRole('heading', { name: '8 of 9 done' })).toBe(document.activeElement)
    expect(screen.getByRole('link', { name: 'Open the Month' }).getAttribute('href')).toBe('#/month')
    fireEvent.click(screen.getByRole('button', { name: 'Put it on your iPhone' }))
    expect(screen.getByRole('heading', { name: 'Put it on your iPhone' })).toBeTruthy()
  })

  it('celebrates when all nine are done, AI switched off included, and opens the Coach', async () => {
    renderStart(allButName(), { name: 'Alex', marks: { ...NO_MARKS, phoneTicked: true } })

    expect(await screen.findByRole('heading', { name: 'Your coach is ready' })).toBeTruthy()
    // The plane's flight is index.css's start-fly, which reduced motion turns off.
    expect(screen.getByRole('region', { name: 'Your coach is ready' }).querySelector('svg')?.getAttribute('class')).toContain('start-fly')
    fireEvent.click(screen.getByRole('button', { name: 'Open the Coach' }))
    expect(window.location.hash).toBe('#/coach')
  })
})
