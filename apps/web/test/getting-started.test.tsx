import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDataProvider } from '../src/app-data.js'
import { FirstRun, Shell } from '../src/App.js'
import { MoreScreen } from '../src/screens/MoreScreen.js'
import { SettingsScreen } from '../src/screens/SettingsScreen.js'
import { GettingStartedScreen } from '../src/screens/GettingStartedScreen.js'
import { NO_MARKS, type SetupMarks } from '../src/profile.js'
import type { Category } from '../src/ledger.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { expectNoAxeViolations } from './axe.js'

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
  vi.unstubAllGlobals()
  window.location.hash = ''
})

describe('Getting started (plan §8.1)', () => {
  it('opens on the first step not done, saying where it is and how long it takes', async () => {
    renderStart(createFakeSupabase())

    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 9 · under a minute')).toBeTruthy()
    expect(screen.getByText('Not done yet')).toBeTruthy()
    expect(screen.getByText(/Nothing breaks if you stop here/)).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('walks the steps with Continue, each read from its title', async () => {
    renderStart(createFakeSupabase())
    await screen.findByRole('heading', { name: 'Your name' })

    continueOn()
    expect(screen.getByRole('heading', { name: 'Your lists' })).toBe(document.activeElement)
    expect(screen.getByText('Step 2 of 9 · about 2 minutes')).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Use the starter list' })).toBeTruthy()
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

  // Mockup A: from 1280px every step lies open beside the step; narrower it is folded under it.
  it('lays all nine open beside the step from 1280px, the step showing marked, and folded under it narrower', async () => {
    let wide = false
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: wide && query === '(min-width: 1280px)', addEventListener: () => undefined, removeEventListener: () => undefined }))
    renderStart(createFakeSupabase())
    const step = (await screen.findByRole('heading', { name: 'Your name' })).closest('section')!
    const folded = screen.getByText(/^All 9 steps/).closest('details')!
    expect(folded.open).toBe(false)
    cleanup()

    wide = true
    renderStart(createFakeSupabase())
    await screen.findByRole('heading', { name: 'Your name' })
    const beside = screen.getByText(/^All 9 steps/).closest('details')!
    expect(beside.open).toBe(true)
    expect(step.contains(beside)).toBe(false)
    expect(within(beside).getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'step').map((b) => b.textContent?.replace(/:.*$/, ''))).toEqual(['·Your name'])
    await expectNoAxeViolations()
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

  it('saves the name as Setup does, and reads it as done', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    renderStart(fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Type your first name, then press Save.')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Your first name' }), { target: { value: ' Alex ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved. Hello, Alex.')).toBeTruthy()
    expect(fake.user.user_metadata['display_name']).toBe('Alex')
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('puts Setup’s own editors on the lists, pay and bills steps', async () => {
    const fake = createFakeSupabase({ categories: [category('pay', 'Day job', 'income'), category('rent', 'Rent', 'bill')] })
    await fake.signIn()
    renderStart(fake, { name: 'Alex' })

    expect(await screen.findByRole('heading', { name: 'When you’re paid' })).toBeTruthy()
    expect(await within(screen.getByRole('region', { name: 'Income' })).findByRole('combobox', { name: 'How often Day job pays' })).toBeTruthy()
    continueOn()
    const bills = within(screen.getByRole('region', { name: 'Bills' }))
    expect(await bills.findByRole('textbox', { name: 'Monthly amount for Rent, from September on' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Debts' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Subscriptions' })).toBeTruthy()

    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /Your lists/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use the starter list' }))
    expect(await screen.findByText(/^Added \d+ example names$/)).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'Variable expenses' })).getByRole('textbox', { name: 'Rename Groceries' })).toBeTruthy()
  })

  it('offers the flight-training goal first, filled in, then Add another, through Savings’ own sheet', async () => {
    const fake = createFakeSupabase({ categories: [category('food', 'Groceries', 'variable')] })
    await fake.signIn()
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'When you’re paid' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /Your savings goals/ }))

    fireEvent.click(await screen.findByRole('button', { name: 'Add your flight-training goal' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Add a goal' }))
    expect(sheet.getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('Flight training')
    expect(sheet.getByLabelText<HTMLInputElement>('Target ($)').value).toBe('30000')
    expect(sheet.getByLabelText<HTMLInputElement>('Cost of an hour ($)').value).toBe('275')
    fireEvent.change(sheet.getByLabelText(/^Saved already/), { target: { value: '2750' } })
    fireEvent.click(sheet.getByRole('button', { name: 'Add goal' }))

    // $30,000.00 less $2,750.00 is 99.09 hours at $275.00: 99 whole hours to go.
    expect(await screen.findByText('About 99 hours of flight time to go.')).toBeTruthy()
    expect(screen.getByText('$2,750.00 saved of $30,000.00')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add another' }))
    expect(within(screen.getByRole('dialog', { name: 'Add a goal' })).getByRole<HTMLInputElement>('textbox', { name: 'Name' }).value).toBe('')
  })

  it('lists every active goal with the main goal leading, and leaves paused ones out', async () => {
    const goal = (id: string, name: string, sort_order: number, status: 'active' | 'paused') => ({
      id, name, target_cents: 100_000, saved_cents: 0, target_date: null, unit_cost_cents: null, unit_label: null,
      created_at: '2026-01-01T00:00:00Z', sort_order, status, reached_on: null,
    })
    const fake = createFakeSupabase({ savings_goals: [goal('g1', 'New car', 1, 'active'), goal('g2', 'Holiday', 0, 'active'), goal('g3', 'Bike', 2, 'paused')] })
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'Your lists' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /Your savings goals/ }))

    const lines = (await screen.findAllByText(/saved of \$1,000\.00$/)).map((l) => l.closest('li')?.textContent)
    expect(lines).toEqual(['HolidayMain goal$0.00 saved of $1,000.00', 'New car$0.00 saved of $1,000.00'])
    expect(screen.getByRole('button', { name: 'Add another' })).toBeTruthy()
  })

  it('brings in a statement with Add’s own reader, and says what still waits in Review', async () => {
    const fake = allButName()
    fake.tables.ingest_candidates.push(
      { id: 'c1', posted_on: '2026-09-10', amount_cents: -1_250, merchant: 'CORNER CAFE', merchant_raw: 'CORNER CAFE', status: 'pending' },
      { id: 'c2', posted_on: '2026-09-11', amount_cents: -4_000, merchant: 'MARKET', merchant_raw: 'MARKET', status: 'pending' },
    )
    renderStart(fake, { name: 'Alex' })

    expect(await screen.findByRole('heading', { name: 'Your first statement' })).toBeTruthy()
    expect(screen.getByText('Choose a statement')).toBeTruthy()
    expect(screen.getByText('2 charges are waiting in Review.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Review' }).getAttribute('href')).toBe('#/review')
    expect(screen.getByText('Not done yet')).toBeTruthy()
  })

  it('types this month’s starting balance with the Month’s own editor, and offers starter budgets only on Accept', async () => {
    const fake = createFakeSupabase({
      categories: [category('food', 'Groceries', 'variable'), category('coffee', 'Coffee', 'variable'), category('rent', 'Rent', 'bill')],
      ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-06-02T10:00:00Z', period_start: '2026-06-01', period_end: '2026-06-30' }],
      transactions: [
        ...[['06', 10_000, 2_000], ['07', 12_000, 2_250], ['08', 11_000, 2_100]].flatMap(([m, food, coffee]) => [
          { id: `f${m}`, posted_on: `2026-${m}-12`, amount_cents: -Number(food), merchant_raw: 'MARKET', category_id: 'food', source: 'card_pdf' },
          { id: `c${m}`, posted_on: `2026-${m}-14`, amount_cents: -Number(coffee), merchant_raw: 'CAFE', category_id: 'coffee', source: 'card_pdf' },
          { id: `r${m}`, posted_on: `2026-${m}-01`, amount_cents: -150_000, merchant_raw: 'LANDLORD', category_id: 'rent', source: 'card_pdf' },
        ]),
      ],
      // Rent's budget is in effect, so it is never offered.
      category_budgets: [{ id: 'x1', category_id: 'rent', month: '2026-08-01', applies: 'onward', budget_cents: 150_000 }],
    })
    await fake.signIn()
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'When you’re paid' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /This month’s starting balance/ }))

    fireEvent.change(await screen.findByRole('textbox', { name: 'Starting bank balance for September' }), { target: { value: '2400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('September started at $2,400.00.')).toBeTruthy()
    expect(fake.tables.month_balances.map((b) => [b.month, b.starting_balance_cents])).toEqual([['2026-09-01', 240_000]])
    expect(await screen.findByText('Done')).toBeTruthy()

    // Coffee's usual month is $21.00, rounded up to $25.00; Groceries' $110.00. Same place on the list: by id.
    const offers = within(await screen.findByRole('region', { name: 'Starter budgets' }))
    expect(offers.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Coffee$25.00Accept', 'Groceries$110.00Accept'])
    expect(offers.getByRole('button', { name: 'Accept all 2' })).toBeTruthy()
    expect(fake.tables.category_budgets).toHaveLength(1)
    fireEvent.click(offers.getByRole('button', { name: 'Accept $25.00 for Coffee' }))
    expect(await offers.findByText('Groceries')).toBeTruthy()
    await waitFor(() => expect(offers.queryByText('Coffee')).toBeNull())
    expect(fake.tables.category_budgets.map((b) => [b.category_id, b.month, b.applies, b.budget_cents])).toEqual([
      ['rent', '2026-08-01', 'onward', 150_000],
      ['coffee', '2026-09-01', 'onward', 2_500],
    ])
  })

  it('writes every starter budget with Accept all, and says when there is no whole month to take one from', async () => {
    const fake = createFakeSupabase({
      categories: [category('food', 'Groceries', 'variable'), category('coffee', 'Coffee', 'variable')],
      ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-08-02T10:00:00Z', period_start: '2026-08-01', period_end: '2026-08-31' }],
      transactions: [
        { id: 'f08', posted_on: '2026-08-12', amount_cents: -10_000, merchant_raw: 'MARKET', category_id: 'food', source: 'card_pdf' },
        { id: 'c08', posted_on: '2026-08-14', amount_cents: -2_000, merchant_raw: 'CAFE', category_id: 'coffee', source: 'card_pdf' },
      ],
    })
    await fake.signIn()
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'When you’re paid' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /This month’s starting balance/ }))

    const offers = within(await screen.findByRole('region', { name: 'Starter budgets' }))
    fireEvent.click(await offers.findByRole('button', { name: 'Accept all 2' }))
    expect(await offers.findByText('Every spending category already has a budget, or nothing to base one on.')).toBeTruthy()
    expect(fake.tables.category_budgets.map((b) => [b.category_id, b.month, b.applies, b.budget_cents])).toEqual([
      ['coffee', '2026-09-01', 'onward', 2_000],
      ['food', '2026-09-01', 'onward', 10_000],
    ])
    cleanup()

    // Records only from this month: nothing is offered yet, and the step says why.
    renderStart(allButName(), { name: 'Alex' })
    await screen.findByRole('heading', { name: 'Put it on your iPhone' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /This month’s starting balance/ }))
    expect(await screen.findByText(/^Once a whole month of your records is in, this offers a budget/)).toBeTruthy()
  })

  it('says in one line when starter budgets need a one-time update, and the balance still works', async () => {
    const fake = allButName()
    fake.fail('category_budgets', '42P01')
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'Put it on your iPhone' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /This month’s starting balance/ }))

    expect(await screen.findByText(/^Starter budgets needs a one-time update\./)).toBeTruthy()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Starting bank balance for September' }).value).toBe('2400.00')
  })

  it('walks One-time updates first when the AI helper is not installed, and says how long', async () => {
    const fake = allButName()
    fake.functions.ai = null
    renderStart(fake, { name: 'Alex', marks: { ...NO_MARKS, phoneTicked: true } })

    expect(await screen.findByRole('heading', { name: 'Turn on free AI' })).toBeTruthy()
    expect(screen.getByText(/^First, the one-time updates: about 15 minutes, once/)).toBeTruthy()
    expect(await screen.findByRole('heading', { name: /\d+ of \d+ in/ })).toBeTruthy()
    expect(screen.getByText('Not done yet')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Free Google Gemini' })).toBeNull()
  })

  it('puts AI settings’ own Gemini card on the step when no key is set up', async () => {
    const fake = allButName()
    fake.functions.aiStatus = aiStatusReply()
    renderStart(fake, { name: 'Alex', marks: { ...NO_MARKS, phoneTicked: true } })

    expect(await screen.findByRole('heading', { name: 'Turn on free AI' })).toBeTruthy()
    expect(await screen.findByText(/^AI isn’t set up yet/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Free Google Gemini' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Get a free key/ }).getAttribute('href')).toBe('https://aistudio.google.com/apikey')
  })

  it('is done already when the receipts key works, with nothing to paste', async () => {
    const fake = allButName()
    const status = aiStatusReply()
    fake.functions.aiStatus = { ...status, services: status.services.map((s) => (s.provider === 'gemini' ? { ...s, source: 'secret' as const } : s)) }
    renderStart(fake, { name: 'Alex' })
    await screen.findByRole('heading', { name: 'Put it on your iPhone' })
    fireEvent.click(screen.getByText(/^All 9 steps/))
    fireEvent.click(screen.getByRole('button', { name: /Turn on free AI/ }))

    expect(await screen.findByText('AI is on, using your receipts key.')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Free Google Gemini' })).toBeNull()
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

  it('ticks the iPhone step by hand, with Help’s own steps, and ends with how many are done', async () => {
    const fake = allButName()
    await fake.signIn()
    renderStart(fake, { name: 'Alex' })

    // Only the iPhone step is left, so it opens there, as the ninth.
    expect(await screen.findByRole('heading', { name: 'Put it on your iPhone' })).toBeTruthy()
    expect(screen.getByText('Step 9 of 9 · about 1 minute')).toBeTruthy()
    expect(screen.getByText('Add to Home Screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('heading', { name: '8 of 9 done' })).toBe(document.activeElement)
    expect(screen.getByRole('link', { name: 'Open the Month' }).getAttribute('href')).toBe('#/month')

    fireEvent.click(screen.getByRole('button', { name: 'Put it on your iPhone' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'It’s on my home screen' }))
    expect(await screen.findByText('Done')).toBeTruthy()
    expect(fake.user.user_metadata['setup_phone_ticked']).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(screen.getByRole('heading', { name: 'Your coach is ready' })).toBeTruthy()
  })

  it('sees the app open from the home screen for itself, with nothing to tick', async () => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true })
    try {
      renderStart(allButName(), { name: '' })
      fireEvent.click(await screen.findByText(/^All 9 steps/))
      fireEvent.click(screen.getByRole('button', { name: /Put it on your iPhone/ }))

      expect(screen.getByText('You’re using the app from your home screen, so this one is done.')).toBeTruthy()
      expect(screen.getByText('Done')).toBeTruthy()
    } finally {
      Reflect.deleteProperty(window.navigator, 'standalone')
    }
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

describe('the first sign-in (plan §8.1)', () => {
  function signInTo(fake: FakeSupabase, marks: SetupMarks = NO_MARKS) {
    return render(
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" setupMarks={marks}>
        <FirstRun />
        <Shell />
      </AppDataProvider>,
    )
  }

  it('opens Getting started for a new account, which marks itself opened', async () => {
    const fake = createFakeSupabase()
    await fake.signIn()
    signInTo(fake)

    expect(await screen.findByRole('heading', { name: 'Your name' })).toBeTruthy()
    expect(window.location.hash).toBe('#/start')
    await waitFor(() => expect(fake.user.user_metadata['setup_opened']).toBe(true))
  })

  it('leaves the Month alone once the guide has been opened, or the account has lists', async () => {
    signInTo(createFakeSupabase(), { ...NO_MARKS, opened: true })
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    cleanup()

    signInTo(createFakeSupabase({ categories: [category('food', 'Groceries', 'variable')] }))
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy()
    expect(window.location.hash).toBe('')
  })

  it('never takes the owner from an address they opened', async () => {
    window.location.hash = '#/review'
    signInTo(createFakeSupabase())
    expect(await screen.findByRole('heading', { name: 'Review' })).toBeTruthy()
    expect(window.location.hash).toBe('#/review')
  })
})

describe('Getting started’s progress on More and Settings (plan §8.1)', () => {
  function renderWith(screenToShow: ReactNode, fake: FakeSupabase, marks: SetupMarks = NO_MARKS) {
    return render(
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com" displayName="Alex" setupMarks={marks}>
        {screenToShow}
      </AppDataProvider>,
    )
  }

  it('says how many are done under Getting started on More, once every answer is in', async () => {
    renderWith(<MoreScreen />, allButName())
    const item = screen.getByRole('link', { name: /^Getting started/ })
    expect(item.textContent).toBe('Getting startedOne step at a time')
    await waitFor(() => expect(item.textContent).toBe('Getting started8 of 9 done'))
  })

  it('gives Settings a Getting started card with the same line, and All done once all nine are', async () => {
    renderWith(<SettingsScreen />, allButName(), { ...NO_MARKS, phoneTicked: true })
    const card = screen.getByRole('heading', { name: 'Getting started' }).closest('div')!.parentElement!
    expect(await within(card).findByText('All done')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Open Getting started' }))
    expect(window.location.hash).toBe('#/start')
  })
})
