import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Wednesday 23 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 23, 12)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

/** The flight goal as the owner has it: $30,000 at $275 an hour, typed, on no fund. */
function withGoal(saved: number, unitCost: number | null = 27_500): FakeSupabase {
  const fake = createFakeSupabase()
  fake.tables.savings_goals.push({
    id: 'g1', name: 'Flight training', target_cents: 3_000_000, saved_cents: saved, target_date: null,
    unit_cost_cents: unitCost, unit_label: unitCost === null ? null : 'flight time',
  })
  return fake
}

/** A paragraph whose whole text is `s`, however it is split into spans. */
const para = (s: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === s

beforeAll(() => warmScreen('#/coach', 'Coach'))

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

describe('the Coach’s flight card', () => {
  // Hand-derived: 12,650.00 × 60 ÷ 275.00 = 2,760 min, 46 h; 30,000.00 × 60 ÷
  // 275.00 = 6,545.45, 6,545 min, 109 h; 12,650 ÷ 30,000 = 42.17%, shown 42%.
  it('shows the hours saved of the hours the target buys, the ring and the amounts', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000))

    expect(await screen.findByRole('heading', { name: 'Coach', level: 1 })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Flight training', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('46 h of 109 hof flight time'))).toBeTruthy()
    expect(screen.getByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.getByText('42%')).toBeTruthy()
    expect(document.title).toBe('Coach · Budget')
    await expectNoAxeViolations()
  })

  // Mockup A (step 7): the goal card alone is the wide screen's right column,
  // after the day's line on a phone; Ask closes the rest, never below the fold
  // of a sticky column (design-review P2 item 11).
  it('puts the goal card before the check-in, and Ask after the insights, in a column of its own', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000))

    const goal = await screen.findByRole('region', { name: 'Flight training' })
    const checkin = screen.getByRole('link', { name: /check-in/ })
    const insights = await screen.findByRole('region', { name: 'Insights' })
    const ask = screen.getByLabelText('Ask anything about your money')
    const follows = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(goal, checkin) && follows(checkin, insights) && follows(insights, ask)).toBe(true)
    expect(goal.parentElement?.contains(checkin)).toBe(false)
    expect(checkin.parentElement?.contains(ask)).toBe(true)
    // Neither the card nor the column holding it may stick, at any width.
    expect(goal.className).not.toMatch(/\bsticky\b/)
    expect(goal.parentElement?.className).not.toMatch(/\bsticky\b/)
  })

  // Hand-derived: 8,450.00 typed at the end of 1 September and 200.00 moved in
  // on the 5th (D16) is 8,650.00; × 60 ÷ 275.00 = 1,887.27, 1,887 min, 31 h.
  it("counts a fund's goal at the balance its transfers keep, as Savings does", async () => {
    const fake = withGoal(845_000)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-09-05', amount_cents: -20_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' })
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('$8,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.getByText(para('31 h of 109 hof flight time'))).toBeTruthy()
  })

  it('keeps showing the amount typed when the funds cannot be read', async () => {
    const fake = withGoal(1_265_000)
    fake.fail('transactions', '42P01')
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // Hand-derived: nothing typed at the end of 1 September and 50.00 moved out
  // of the fund on the 5th (D16) is -50.00, which buys no hours.
  it('shows no hours when more has been taken out of the fund than put in', async () => {
    const fake = withGoal(0)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push({ id: 't9', posted_on: '2026-09-05', amount_cents: 5_000, merchant_raw: 'FROM FLIGHT FUND', category_id: 'c4', source: 'typed' })
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(para('-$50.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
  })

  it('shows 0 h when nothing is saved yet', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(0))

    expect(await screen.findByText(para('0 h of 109 hof flight time'))).toBeTruthy()
    expect(screen.getByText(para('$0.00 saved of $30,000.00'))).toBeTruthy()
  })

  it('shows no hours for a goal with no hourly cost', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000, null))

    expect(await screen.findByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
  })

  // Goals are added on Savings now (G1), not in Settings.
  it('offers to add a goal when there is none', async () => {
    go('/coach')
    renderScreen(<Shell />, createFakeSupabase())

    expect(await screen.findByText('No goal yet.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add a goal' }).getAttribute('href')).toBe('#/savings')
  })

  it('opens the check-in at its address, not the Coach', async () => {
    go('/coach/checkin')
    renderScreen(<Shell />, withGoal(1_265_000))

    expect(await screen.findByRole('heading', { name: 'Your Sunday check-in', level: 1 })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Coach', level: 1 })).toBeNull()
  })
})

describe('the Coach’s goals, more than one (G1)', () => {
  const other = (id: string, name: string, more: Record<string, unknown>) => ({
    id, name, target_cents: 100_000, saved_cents: 15_000, target_date: null, unit_cost_cents: null, unit_label: null, ...more,
  })

  // Hand-derived: Travel $150.00 of $1,000.00 is 1,500 bp, a bar 15% long.
  it('leads with the main goal, and lists the other active goals under it with their bars', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals.push(other('g2', 'Travel', { sort_order: 1 }), other('g3', 'House', { status: 'paused' }))
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('heading', { name: 'Flight training', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('46 h of 109 hof flight time'))).toBeTruthy()
    const list = screen.getByRole('heading', { name: 'Your other goals', level: 3 }).parentElement!
    expect([...list.querySelectorAll('li')].map((li) => li.querySelector('p')?.textContent)).toEqual(['Travel$150.00 of $1,000.00'])
    expect((list.querySelector('[role=presentation] > div') as HTMLElement).style.width).toBe('15%')
    expect(within(list).getByRole('link', { name: 'All your goals on Savings' }).getAttribute('href')).toBe('#/savings')
  })

  it('cheers the main goal on in the app’s own words, in the owner’s tone', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals.push(other('g2', 'Travel', { sort_order: 1 }))
    go('/coach')
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(para('Every lighter week brings Flight training closer. Keep going!'))).toBeTruthy()
    cleanup()
    const straight = withGoal(1_265_000)
    straight.tables.ai_settings.push({ user_id: 'u1', tone: 'straight' })
    renderScreen(<Shell />, straight)
    expect(await screen.findByText(para('Each week you spend less moves Flight training closer.'))).toBeTruthy()
    expect(screen.queryByText(/✨/)).toBeNull()
  })

  it('shows the goal made main instead, in dollars when it has no cost an hour', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, sort_order: 1 }
    fake.tables.savings_goals.push(other('g2', 'Travel', { sort_order: 0 }))
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByRole('heading', { name: 'Travel', level: 2 })).toBeTruthy()
    expect(screen.getByText(para('$150.00 saved of $1,000.00'))).toBeTruthy()
    expect(screen.queryByText(/ h of /)).toBeNull()
    expect(screen.getByText('Flight training')).toBeTruthy()
  })

  it('says when no goal is active, and where to resume one', async () => {
    const fake = withGoal(1_265_000)
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, status: 'reached', reached_on: '2026-09-01' }
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('No active goal.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Savings' }).getAttribute('href')).toBe('#/savings')
  })

  it('shows the owner’s one goal with nothing listed under it', async () => {
    go('/coach')
    renderScreen(<Shell />, withGoal(1_265_000))
    await screen.findByRole('heading', { name: 'Flight training', level: 2 })
    expect(screen.queryByRole('heading', { name: 'Your other goals' })).toBeNull()
  })
})

describe('the Coach’s wins (A08)', () => {
  /**
   * Hand-derived (F33): $12,000.00 typed on 1 September, $300.00 moved in on
   * the 15th and $350.00 on the 21st, so $12,650.00 now, 46 h. On the eve of
   * last week's Monday (13 Sep) it was $12,000.00: 2,618.18… minutes, 43 h.
   * 45 hours passed.
   */
  function withMilestone(): FakeSupabase {
    const fake = withGoal(1_200_000)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.transactions.push(
      { id: 't1', posted_on: '2026-09-15', amount_cents: -30_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' },
      { id: 't2', posted_on: '2026-09-21', amount_cents: -35_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' },
    )
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    return fake
  }

  it('cheers a goal’s milestone in a card that opens the goals', async () => {
    go('/coach')
    renderScreen(<Shell />, withMilestone())

    const card = (await screen.findByRole('heading', { name: 'Milestone: Flight training' })).closest('li')!
    expect(within(card).getByText(para('You’ve now saved 45 hours toward it. Every step counts, so keep going!'))).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'See your goals' }))
    expect(window.location.hash).toBe('#/savings')
  })

  it('says in “Why am I seeing this?” which milestone was passed, and why that is a card', async () => {
    go('/coach')
    renderScreen(<Shell />, withMilestone())
    const card = (await screen.findByRole('heading', { name: 'Milestone: Flight training' })).closest('li')!
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))

    const sheet = within(screen.getByRole('dialog', { name: 'Why am I seeing this?' }))
    expect(sheet.getAllByRole('term').map((t) => [t.textContent, t.nextElementSibling?.textContent])).toEqual([['Milestone passed', '45 hours']])
    expect(sheet.getByText(/^It shows because your savings passed a milestone since last week began/)).toBeTruthy()
  })

  it('says more was saved than by this day last month, and names the figures', async () => {
    // Records from 1 August: $100.00 into savings by 23 Aug, $300.00 by 23 Sep, $200.00 more.
    const fake = withGoal(1_265_000)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-08-01', period_end: '2026-09-20' })
    fake.tables.transactions.push(
      { id: 't1', posted_on: '2026-08-05', amount_cents: -10_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' },
      { id: 't2', posted_on: '2026-09-05', amount_cents: -30_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' },
    )
    go('/coach')
    renderScreen(<Shell />, fake)

    const card = (await screen.findByRole('heading', { name: 'You saved more this month' })).closest('li')!
    expect(within(card).getByText(para('You’ve put $200.00 more into savings than by this day in August. Keep it up!'))).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'Why am I seeing this?' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Why am I seeing this?' }))
    expect(sheet.getAllByRole('term')[0]?.textContent).toBe('Saved so far this month')
    expect(sheet.getByText('It shows because more has gone into your savings than by this day last month.')).toBeTruthy()
  })

  it('cheers nothing while no 5 hours were passed', async () => {
    // $12,400.00 typed, only the 21st's $350.00 since: 2,705.45… minutes, 45 h,
    // on the eve, and $12,750.00, 46 h, now. No 5 hours passed.
    const fake = withMilestone()
    fake.tables.transactions.splice(0, 1)
    fake.tables.savings_goals[0] = { ...fake.tables.savings_goals[0]!, saved_cents: 1_240_000 }
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/^Nothing needs your attention today\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /^Milestone/ })).toBeNull()
  })

  it('counts no move made before the day the fund’s balance was typed', async () => {
    // $12,500.00 typed on 16 September, the 15th's $300.00 already in it, and
    // $150.00 on the 21st: $12,650.00 now, 46 h. From the 16th, $12,500.00,
    // 45.45… h, 45 h: no 5 hours passed. Counting the 15th would say 44 h.
    const fake = withMilestone()
    fake.tables.transactions[fake.tables.transactions.length - 1] = { ...fake.tables.transactions.at(-1)!, amount_cents: -15_000 }
    Object.assign(fake.tables.savings_goals[0]!, { saved_cents: 1_250_000, balance_as_of: '2026-09-16' })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/^Nothing needs your attention today\./)).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /^Milestone/ })).toBeNull()
  })
})

describe('when each goal is reached at your pace (A08, F33)', () => {
  /**
   * Hand-derived: records from 1 May; $12,650.00 of $30,000.00 typed on 1
   * September in the flight fund, with May $400.00, June $650.00, July
   * $500.00 and August $300.00 moved in before it. Low $300.00, middle
   * $450.00, high $500.00 a month: $69.23, $103.85 and $115.38 a week, 251,
   * 168 and 151 weeks from 23 September.
   */
  function paced(recordsFrom = '2026-05-01', targetDate: string | null = null): FakeSupabase {
    const fake = withGoal(1_265_000)
    fake.tables.categories.push({ id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null })
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: recordsFrom, period_end: '2026-09-20' })
    const moves: [string, number][] = [['2026-05-15', 400], ['2026-06-01', 400], ['2026-06-15', 250], ['2026-07-15', 500], ['2026-08-15', 300]]
    fake.tables.transactions.push(
      ...moves.map(([posted_on, dollars], i) => ({
        id: `t${i}`, posted_on, amount_cents: -dollars * 100, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' as const,
      })),
    )
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01', target_date: targetDate })
    return fake
  }

  it('gives the main goal a range of dates, the likeliest, and how many months it stands on', async () => {
    const fake = paced()
    fake.tables.savings_goals.push({ id: 'g2', name: 'Travel', target_cents: 100_000, saved_cents: 15_000, target_date: null, unit_cost_cents: null, unit_label: null, sort_order: 1 })
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('At your pace: Aug 2029 – Jul 2031')).toBeTruthy()
    expect(screen.getByText('Based on 4 months')).toBeTruthy()
    expect(screen.getByText('Most likely Dec 2029.')).toBeTruthy()
    // Travel is on no fund, so nothing moved in can be measured.
    const others = screen.getByRole('heading', { name: 'Your other goals', level: 3 }).parentElement!
    expect(within(others).getByText('On no fund yet')).toBeTruthy()
  })

  it('gives one month, not a range, when every date falls in it', async () => {
    // $450.00 moved in each month: every pace is $103.85 a week, 168 weeks, 12 Dec 2029.
    const fake = paced()
    fake.tables.transactions.splice(0, fake.tables.transactions.length, ...['05', '06', '07', '08'].map((m, i) => ({
      id: `e${i}`, posted_on: `2026-${m}-15`, amount_cents: -45_000, merchant_raw: 'TO FLIGHT FUND', category_id: 'c4', source: 'typed' as const,
    })))
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('At your pace: about Dec 2029')).toBeTruthy()
    expect(screen.getByText('Based on 4 months')).toBeTruthy()
    expect(screen.queryByText(/^Most likely/)).toBeNull()
  })

  it('gives one rough date under three complete months', async () => {
    // July and August: $400.00 a month, $92.31 a week, 188 weeks.
    go('/coach')
    renderScreen(<Shell />, paced('2026-07-01'))

    expect(await screen.findByText('At your pace: about May 2030')).toBeTruthy()
    expect(screen.getByText('Rough: 2 months')).toBeTruthy()
    expect(screen.queryByText(/^Most likely/)).toBeNull()
  })

  it('says when it will be possible before a whole month of records is in', async () => {
    go('/coach')
    renderScreen(<Shell />, paced('2026-08-08'))

    expect(await screen.findByText('Too early to tell: check back on 1 Oct 2026, once a whole month of records is in.')).toBeTruthy()
  })

  it('says what a week must add to reach a target date', async () => {
    // $17,350.00 over 731 ÷ 7 weeks, rounded up.
    go('/coach')
    renderScreen(<Shell />, paced('2026-05-01', '2028-09-23'))

    expect(await screen.findByText(para('To reach it by 23 Sep 2028: $166.15 a week.'))).toBeTruthy()
  })

  it('says in one line, pointing to Help, when the funds need a one-time update, and keeps the rest', async () => {
    // Before 0013 the funds read meets 42703; the goal still shows at the amount typed.
    const fake = paced()
    fake.server.lacks = { savings_goals: ['category_id', 'start_date', 'balance_as_of'] }
    go('/coach')
    renderScreen(<Shell />, fake)

    const link = await screen.findByRole('link', { name: 'See One-time updates' })
    expect(link.getAttribute('href')).toBe('#/help/updates')
    expect(screen.getByText(para('When you will get there needs a one-time update. See One-time updates'))).toBeTruthy()
    expect(screen.getByText(para('$12,650.00 saved of $30,000.00'))).toBeTruthy()
    expect(screen.queryByText(/on no fund|Make it a fund/i)).toBeNull()
    expect(await screen.findByRole('region', { name: 'Insights' })).toBeTruthy()
  })

  it('still gives the date when the goals’ order needs its one-time update (0015)', async () => {
    const fake = paced()
    fake.server.lacks = { savings_goals: ['sort_order', 'status', 'reached_on'] }
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('At your pace: Aug 2029 – Jul 2031')).toBeTruthy()
  })

  it('says the date did not load when the funds read fails for another reason', async () => {
    // Only the funds read, which alone asks for a goal's fund; the shared goals read still works.
    const fake = paced()
    fake.server.refuse = (table, query) => (table === 'savings_goals' && (query.get('select') ?? '').includes('category_id') ? '57014' : null)
    go('/coach')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('When you will get there did not load. Reload to try again.')).toBeTruthy()
  })
})

describe('what to trim on the Coach (A08, F34)', () => {
  /**
   * The paced goal above, with Dining out $300.00, $420.00, $360.00 and
   * $510.00 from May to August: its usual month is $390.00, a quarter $97.50,
   * $100.00 to the nearest $5. At the middle pace of $103.85 a week, $23.08 a
   * week more is 168 − 137 = 31 weeks sooner, and 100.00 × 60 ÷ 275.00 = 22
   * minutes of flight time a month.
   */
  function withDining(moves = true): FakeSupabase {
    const fake = withGoal(1_265_000)
    fake.tables.categories.push(
      { id: 'c4', name: 'Flight fund', kind: 'savings', sort_order: 0, weekly_budget_cents: null },
      { id: 'c5', name: 'Dining out', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
    )
    fake.tables.ingest_batches.push({ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: '2026-05-01', period_end: '2026-09-20' })
    const row = (id: string, posted_on: string, dollars: number, category_id: string) => ({
      id, posted_on, amount_cents: -dollars * 100, merchant_raw: 'SYNTHETIC', category_id, source: 'typed' as const,
    })
    const fund: [string, number][] = [['2026-05-15', 400], ['2026-06-01', 400], ['2026-06-15', 250], ['2026-07-15', 500], ['2026-08-15', 300]]
    if (moves) fake.tables.transactions.push(...fund.map(([day, dollars], i) => row(`f${i}`, day, dollars, 'c4')))
    fake.tables.transactions.push(
      ...[['05', 300], ['06', 420], ['07', 360], ['08', 510]].map(([m, dollars], i) => row(`d${i}`, `2026-${m as string}-10`, dollars as number, 'c5')),
    )
    Object.assign(fake.tables.savings_goals[0]!, { category_id: 'c4', start_date: null, balance_as_of: '2026-09-01' })
    return fake
  }

  it('offers the top lever, in weeks sooner and flight time, and What if… opens the Forecast', async () => {
    go('/coach')
    renderScreen(<Shell />, withDining())

    expect(await screen.findByText('Trim Dining out by $100.00 a month to get there 31 weeks sooner. That’s 22 min of flight time a month.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'What if…' }))
    expect(window.location.hash).toBe('#/forecast')
  })

  it('says how long the lever alone takes when nothing is moved in', async () => {
    // No pace: ⌈17,350.00 ÷ 23.08⌉ = 752 weeks.
    go('/coach')
    renderScreen(<Shell />, withDining(false))

    expect(await screen.findByText('No date at your current pace: in a usual month, nothing is moved into it.')).toBeTruthy()
    expect(screen.getByText('Trim Dining out by $100.00 a month, and that alone gets you there in 752 weeks. That’s 22 min of flight time a month.')).toBeTruthy()
  })
})
