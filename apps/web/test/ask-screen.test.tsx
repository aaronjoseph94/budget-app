import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AskScreen } from '../src/screens/AskScreen.js'
import type { FakeSupabase } from './fake-supabase.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'

/**
 * Ask (plan A24) on the Forecast's worked example, invented data only:
 * Thursday 24 September 2026. Dining out came to $1,054.00 in August;
 * Flight training, $17,350.00 to go, is reached in May 2030 at its middle
 * pace of $92.31 a week (F33).
 */
function open(fake: FakeSupabase) {
  renderScreen(<AskScreen topic={null} />, fake)
}

async function ask(question: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your question' }), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}

/** A sentence whose figures are drawn in their own spans, found by its whole text. */
const sentence = (text: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === text
const answerCard = async (text: string) => (await screen.findByText(sentence(text))).closest('.rounded-xl') as HTMLElement

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  // Drawn once first, so no find races a cold start (N87): setup waits for the page itself, as warmScreen does.
  open(forecastFakeWithGoals())
  await new Promise<void>((resolve) => {
    const shown = () => document.body.textContent?.includes('Try asking') === true
    if (shown()) return resolve()
    const watch = new MutationObserver(() => shown() && (watch.disconnect(), resolve()))
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Ask with AI off', () => {
  it('reads the question itself, says why, and answers with core’s figure', async () => {
    open(forecastFakeWithGoals())
    await ask('How much did I spend on dining out in August?')

    const card = await answerCard('You spent $1,054.00 on Dining out.')
    expect(within(card).getByText('I read that as: How much you spent · Dining out · August 2026')).toBeTruthy()
    expect(within(card).getByText('$1,054.00', { selector: 'p' })).toBeTruthy()
    expect(within(card).getByText('1 – 31 Aug')).toBeTruthy()
    expect(within(card).getByRole('link', { name: 'See it on the Month' }).getAttribute('href')).toBe('#/month/2026-08')
    expect(screen.getByText(/The app read your question itself\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Turn on free AI (2 minutes)' }).getAttribute('href')).toBe('#/ai')
  })

  it('answers a suggested question with no call to the AI', async () => {
    const fake = forecastFakeWithGoals()
    open(fake)
    fireEvent.click(await screen.findByRole('button', { name: 'How much is safe to spend today?' }))

    await screen.findByText(sentence('You can spend $502.85 a day until the month ends, today included.'))
    expect(fake.functions.calls.filter((c) => c['action'] === 'run')).toEqual([])
  })
})

describe('Ask fails soft', () => {
  it('reads the question itself when the AI helper is not installed, pointing to One-time updates', async () => {
    const fake = forecastFakeWithGoals()
    fake.functions.ai = null
    open(fake)
    await ask('How much did I spend on dining out in August?')

    await screen.findByText(sentence('You spent $1,054.00 on Dining out.'))
    expect(screen.getByText(/The AI helper needs a one-time update, so the app read your question itself\./)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
  })

  it('says the forecast needs a one-time update when its reads are missing, and still answers the rest', async () => {
    const fake = forecastFakeWithGoals()
    fake.fail('pay_schedules', '42P01')
    open(fake)
    fireEvent.click(await screen.findByRole('button', { name: 'How much is safe to spend today?' }))

    await screen.findByText(/The forecast needs a one-time update\./)
    await ask('How much did I spend on dining out in August?')
    await waitFor(() => expect(screen.getByText(sentence('You spent $1,054.00 on Dining out.'))).toBeTruthy())
  })
})
