import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { CHECKIN_TODAY, checkinFake } from './checkin-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/** The Sunday check-in (plan §2.4, A20) on F42's example, with the app's own words. */
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s
const section = (name: string) => screen.getByRole('heading', { name, level: 2 }).closest('div.rounded-xl') as HTMLElement
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const RECAP = 'Last week you spent $226.09 on everyday things. That went $16.09 past your weekly budgets.'

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CHECKIN_TODAY)
  await warmScreen('#/coach/checkin', 'Your Sunday check-in', { fake: checkinFake(), text: 'Keep Dining out under' })
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(CHECKIN_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  // The warm-up asked the AI too, and a device asks once a week.
  window.localStorage.clear()
  go('/coach/checkin')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
  window.localStorage.clear()
})

describe('the Sunday check-in', () => {
  // e2e-setup-04: a week past the latest statement read "$0.00 … Well done!".
  it('says last week is not all in yet when the latest statement ends before its Sunday, and praises nothing', async () => {
    const fake = checkinFake()
    fake.tables.ingest_batches.splice(0, 1, { ...fake.tables.ingest_batches[0]!, period_end: '2026-09-25' })
    fake.functions.ai = () => json({ ok: false, code: 'ai_off' }, 409)
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', 'Your latest statement runs to 25 Sep, so last week isn’t all in yet. Import the next one and the recap fills in.'))).toBeTruthy()
    expect(screen.queryByText(whole('P', RECAP))).toBeNull()
    expect(screen.queryByText(/a win!|Well done/)).toBeNull()
    expect(screen.queryByText(/^Keep Dining out under/)).toBeNull()
  })

  it('is whole with AI off: the recap, a win, the questions, one thing to try and the goals, in the app’s own words', async () => {
    const fake = checkinFake()
    fake.functions.ai = () => json({ ok: false, code: 'ai_off' }, 409)
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', RECAP))).toBeTruthy()
    expect(screen.getByText('The week of 21 – 27 Sep')).toBeTruthy()
    expect(within(section('Last week')).getByText(whole('P', 'You spent $23.91 less than the week before. That’s a win!'))).toBeTruthy()
    const asked = within(section('Was it planned?')).getAllByRole('listitem').map((li) => li.querySelector('p')?.textContent)
    expect(asked).toEqual(['Was GROCER, $112.40 on 24 Sep, planned?', 'Was SUSHI PLACE, $84.20 on 23 Sep, planned?', 'Was BURGER BAR, $20.00 on 26 Sep, planned?'])
    expect(within(section('One thing to try')).getByText(whole('P', 'Try keeping Dining out under $65.00 next week.'))).toBeTruthy()
    expect(within(section('Your goal')).getByText(whole('P', 'Every lighter week brings Flight training closer. Keep going!'))).toBeTruthy()
    expect(within(section('Your goal')).getByText('46 h of 109 h')).toBeTruthy()
    expect(await screen.findByText(/^AI is off\. Everything still works; the Coach uses the app’s own words\./)).toBeTruthy()
    expect(fake.functions.calls).toEqual([expect.objectContaining({ action: 'run', task: 'narrate', pack: 'checkin' })])
    await expectNoAxeViolations()
  })

  it('shows the AI’s words where they pass, the app’s own where one fails, and keeps them with no figure', async () => {
    const fake = checkinFake()
    fake.functions.ai = () =>
      json({
        ok: true,
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        text: JSON.stringify({ recap: 'A calmer week: {{A.now}} on everyday things.', win: 'You spent twice as little.', tryThis: 'Cook at home a few nights, and keep {{B.name}} under {{B.limit}}.', goal: null }),
      })
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', '✨ Written by AI: A calmer week: $226.09 on everyday things.'))).toBeTruthy()
    expect(within(section('Last week')).getByText(whole('P', 'You spent $23.91 less than the week before. That’s a win!'))).toBeTruthy()
    expect(within(section('One thing to try')).getByText(whole('P', '✨ Written by AI: Cook at home a few nights, and keep Dining out under $65.00.'))).toBeTruthy()
    expect(screen.getByText('✨ Words by free Google Gemini; figures by the app.')).toBeTruthy()
    await waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    const note = fake.tables.ai_notes[0]!
    expect([note['surface'], note['scope']]).toEqual(['checkin', 'week:2026-09-21'])
    expect(JSON.stringify(note['body'])).not.toMatch(/\d/)
  })

  it('shows the app’s own words for a part whose AI words name another part’s figure', async () => {
    const fake = checkinFake()
    const reply = { recap: null, win: null, tryThis: 'Keep spending near {{A.now}}.', goal: null }
    fake.functions.ai = () => json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(reply) })
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('✨ Words by free Google Gemini; figures by the app.')).toBeTruthy()
    expect(within(section('One thing to try')).getByText(whole('P', 'Try keeping Dining out under $65.00 next week.'))).toBeTruthy()
    expect(screen.queryByText(/Keep spending near/)).toBeNull()
  })

  it('checks kept words again, and asks anew when a kept part breaks the text rule', async () => {
    const fake = checkinFake()
    const good = { recap: 'A calmer week: {{A.now}} on everyday things.', win: null, tryThis: null, goal: null }
    fake.functions.ai = () => json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(good) })
    renderScreen(<Shell />, fake)
    await waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    const note = fake.tables.ai_notes[0]!

    // A kept part naming another part's figure shows the app's own words, and the AI is not asked again.
    cleanup()
    window.localStorage.clear()
    fake.tables.ai_notes[0] = { ...note, body: { ...good, tryThis: 'Keep spending near {{A.now}}.' } }
    go('/coach/checkin')
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(whole('P', '✨ Written by AI: A calmer week: $226.09 on everyday things.'))).toBeTruthy()
    expect(within(section('One thing to try')).getByText(whole('P', 'Try keeping Dining out under $65.00 next week.'))).toBeTruthy()
    expect(fake.functions.calls).toHaveLength(1)

    // A kept part with a figure in it is not trusted at all: the AI is asked again.
    cleanup()
    window.localStorage.clear()
    fake.tables.ai_notes[0] = { ...note, body: { ...good, win: 'Spent 2 times less.' } }
    go('/coach/checkin')
    renderScreen(<Shell />, fake)
    await waitFor(() => expect(fake.functions.calls).toHaveLength(2))
  })

  it('shows the app’s words and one line pointing to Help when the AI helper is not installed', async () => {
    const fake = checkinFake()
    fake.functions.ai = null
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/^The AI helper isn’t installed yet\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Help: One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.getByText(whole('P', RECAP))).toBeTruthy()
  })

  it('asks the AI once a week on a device, however often the check-in is opened', async () => {
    const fake = checkinFake()
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/^AI isn’t set up yet\./)).toBeTruthy()
    cleanup()
    go('/coach/checkin')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('In the app’s own words, from your records.')).toBeTruthy()
    expect(fake.functions.calls.filter((c) => c['action'] === 'run')).toHaveLength(1)
  })

  it('writes the weekly limit only when its button is tapped, through the Week’s save', async () => {
    const fake = checkinFake()
    renderScreen(<Shell />, fake)

    const button = await screen.findByRole('button', { name: 'Yes, set it' })
    expect(screen.getByText(whole('P', 'Keep Dining out under $65.00 next week?'))).toBeTruthy()
    // Everything has drawn, and nothing is written.
    expect(fake.tables.categories.find((c) => c.id === 'dining')?.weekly_budget_cents).toBe(7_000)
    fireEvent.click(button)
    expect(await screen.findByText(whole('P', 'Done: Dining out’s weekly budget is $65.00. It shows on the Week.'))).toBeTruthy()
    expect(fake.tables.categories.find((c) => c.id === 'dining')?.weekly_budget_cents).toBe(6_500)
    // The check-in holds still after the save's re-read, and asks the AI no more.
    expect(screen.getByText(whole('P', 'Keep Dining out under $65.00 next week?'))).toBeTruthy()
    expect(fake.functions.calls).toHaveLength(1)
  })

  it('says so in one line when the weekly budget is not saved', async () => {
    const fake = checkinFake()
    fake.fail('PATCH categories', '42501')
    renderScreen(<Shell />, fake)

    fireEvent.click(await screen.findByRole('button', { name: 'Yes, set it' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The weekly budget wasn’t saved. Try again, or set it on the Week.')
  })

  it('keeps an answer, marks it chosen, and counts it in the impulse share', async () => {
    const fake = checkinFake()
    renderScreen(<Shell />, fake)

    const group = await screen.findByRole('group', { name: 'SUSHI PLACE: planned, impulse or needed' })
    fireEvent.click(within(group).getByRole('button', { name: 'Impulse' }))
    await waitFor(() => expect(within(group).getByRole('button', { name: 'Impulse' }).getAttribute('aria-pressed')).toBe('true'))
    expect(fake.tables.coach_answers).toEqual([expect.objectContaining({ transaction_id: 'sushi', answer: 'impulse', asked_week: '2026-09-21' })])
    expect(screen.getByText('Over the last 8 weeks you called 100% of 1 charge impulse.')).toBeTruthy()
    // Still asked on screen, marked, rather than giving way to the next charge.
    expect(within(screen.getByRole('main')).getAllByRole('group')).toHaveLength(3)
  })

  // Mockup A (step 7): the answers are a segmented control the arrow keys move
  // along, wrapping, with Home and End; moving never answers, since an answer is saved.
  it('moves along the three answers with the arrow keys, Home and End, and answers only on a press', async () => {
    const fake = checkinFake()
    renderScreen(<Shell />, fake)

    const group = await screen.findByRole('group', { name: 'SUSHI PLACE: planned, impulse or needed' })
    const [planned, impulse, needed] = within(group).getAllByRole('button')
    expect([planned, impulse, needed].map((b) => b?.textContent)).toEqual(['Planned', 'Impulse', 'Needed'])
    planned!.focus()
    fireEvent.keyDown(planned!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(impulse)
    fireEvent.keyDown(impulse!, { key: 'End' })
    expect(document.activeElement).toBe(needed)
    fireEvent.keyDown(needed!, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(planned)
    fireEvent.keyDown(planned!, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(needed)
    fireEvent.keyDown(needed!, { key: 'Home' })
    expect(document.activeElement).toBe(planned)
    expect(fake.tables.coach_answers).toEqual([])
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    await expectNoAxeViolations()
  })

  it('without 0017, replaces only the questions with one line pointing to Help', async () => {
    const fake = checkinFake()
    fake.fail('coach_answers', '42P01')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', RECAP))).toBeTruthy()
    const questions = section('Was it planned?')
    expect(questions.textContent).toContain('Your answers need a one-time update.')
    expect(within(questions).getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(within(questions).queryAllByRole('button')).toEqual([])
    expect(screen.getByRole('button', { name: 'Yes, set it' })).toBeTruthy()
    expect(within(section('Your goal')).getByText('46 h of 109 h')).toBeTruthy()
  })

  // Goals are plural (G1): each active goal, the main goal first, hours only where a goal has a cost an hour.
  it('lists every active goal under the goal line, the main goal first', async () => {
    const fake = checkinFake()
    fake.tables.savings_goals.push(
      { id: 'g2', name: 'Travel', target_cents: 100_000, saved_cents: 15_000, target_date: null, unit_cost_cents: null, unit_label: null, sort_order: 1 },
      { id: 'g3', name: 'House', target_cents: 100_000, saved_cents: 0, target_date: null, unit_cost_cents: null, unit_label: null, status: 'paused' },
    )
    renderScreen(<Shell />, fake)

    const goals = await screen.findByRole('heading', { name: 'Your goals', level: 2 })
    const card = goals.closest('div.rounded-xl') as HTMLElement
    expect(within(card).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Flight training46 h of 109 h', 'Travel$150.00 of $1,000.00'])
    expect(within(card).getByText(whole('P', 'Every lighter week brings Flight training closer. Keep going!'))).toBeTruthy()
  })
})
