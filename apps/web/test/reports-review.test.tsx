import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { REPORT_TODAY, reportFake } from './report-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/** The month in review's words (plan §2.6, §3.11 feature 10, A15), on F36's example. */
function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s
const OWN_HEADLINE = 'A win on Groceries: $80.00 less than usual. Keep an eye on Dining out: $155.00 more than usual.'
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

beforeAll(() => warmScreen('#/reports', 'Reports'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(REPORT_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
  window.localStorage.clear()
})

describe('the month in review', () => {
  it('is complete in the app’s own words with AI off, and says how to turn it on', async () => {
    const fake = reportFake()
    go('/reports/2026-08')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', OWN_HEADLINE))).toBeTruthy()
    const review = screen.getByRole('heading', { name: 'The month in review' }).closest('div.rounded-xl') as HTMLElement
    expect(within(review).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Spent $2,060.00. That is $30.00 more than July. Your usual month: $1,985.00.',
      'Saved $500.00, 12% of what came in. That is $200.00 more than July. Your usual month: $300.00.',
      'Dining out: $560.00, $155.00 more than your usual month of $405.00.',
    ])
    expect(within(review).getByText(whole('P', 'One thing to try: Next month, try a weekly limit for Dining out close to its usual, and check it each Sunday.'))).toBeTruthy()
    // Not set up: the line names AI settings and links there, not "below" (N99).
    expect(await within(review).findByText(/Turn on free AI in AI settings, in about 2 minutes\./)).toBeTruthy()
    expect(within(review).getByRole('link', { name: 'Open AI settings' }).getAttribute('href')).toBe('#/ai')
    expect(fake.functions.calls).toEqual([expect.objectContaining({ action: 'run', task: 'narrate', pack: 'report' })])
    await expectNoAxeViolations()
  })

  it('drops a reply with a digit in it and shows the app’s words there, keeping the parts that passed', async () => {
    const fake = reportFake()
    fake.functions.ai = () =>
      json({
        ok: true,
        provider: 'gemini',
        model: 'gemini-3.5-flash-lite',
        text: JSON.stringify({ headline: 'You saved 12 dollars more than usual.', points: [{ fact: 'B', text: 'Saved {{B.now}}, a steady month for savings.' }], tryThis: null }),
      })
    go('/reports/2026-08')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('LI', '✨ Written by AI: Saved $500.00, a steady month for savings.'))).toBeTruthy()
    expect(screen.getByText(whole('P', OWN_HEADLINE))).toBeTruthy()
    await waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    const note = fake.tables.ai_notes[0]!
    expect([note['surface'], note['scope']]).toEqual(['report', 'month:2026-08'])
    expect(JSON.stringify(note['body'])).not.toMatch(/\d/)
  })

  it('shows the app’s words and one line pointing to Help when the AI helper is not installed', async () => {
    const fake = reportFake()
    fake.functions.ai = null
    go('/reports/2026-08')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/^The AI helper isn’t installed yet\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Help: One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(screen.getByText(whole('P', OWN_HEADLINE))).toBeTruthy()
  })

  it('never asks the AI about a month still running', async () => {
    const fake = reportFake()
    go('/reports')
    renderScreen(<Shell />, fake)

    expect(await screen.findByText('In the app’s own words. The AI reviews a month once it is over.')).toBeTruthy()
    expect(screen.getByText(whole('LI', 'Spent so far $1,400.00. That is $360.00 less than by this day in August.'))).toBeTruthy()
    expect(fake.functions.calls).toEqual([])
  })
})
