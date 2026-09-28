import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AskBrief } from '@budget/schema'
import { AskScreen } from '../src/screens/AskScreen.js'
import { aiStatusReply, type FakeSupabase } from './fake-supabase.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Ask (plan A24) on the Forecast's worked example, invented data only:
 * Thursday 24 September 2026. Dining out came to $1,054.00 in August;
 * Flight training, $17,350.00 to go, is reached in May 2030 at its middle
 * pace of $92.31 a week (F33).
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** AI on through the receipts key, and a helper that reads every question as `plan`, naming categories by their names' aliases. */
function aiReads(fake: FakeSupabase, plan: Record<string, unknown>, names: readonly string[] = []) {
  const [gemini, ...rest] = fake.functions.aiStatus.services
  fake.functions.aiStatus = aiStatusReply({ services: [{ ...gemini!, source: 'secret', hint: 'abcd' }, ...rest] })
  fake.functions.ai = (body) => {
    if (body['action'] !== 'run') return json(fake.functions.aiStatus)
    const brief = body['data'] as AskBrief
    const categories = names.map((n) => brief.categories.find((c) => c.name === n)?.alias)
    return json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ ...plan, categories }) })
  }
}

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
    await expectNoAxeViolations()
  })

  it('answers a suggested question with no call to the AI', async () => {
    const fake = forecastFakeWithGoals()
    open(fake)
    fireEvent.click(await screen.findByRole('button', { name: 'How much is safe to spend today?' }))

    await screen.findByText(sentence('You can spend $502.85 a day until the month ends, today included.'))
    expect(fake.functions.calls.filter((c) => c['action'] === 'run')).toEqual([])
  })

  it('shows an amount from the question as a chip the owner can change, worked out again on the phone', async () => {
    const fake = forecastFakeWithGoals()
    open(fake)
    await ask('What if I saved $50 a month?')

    await screen.findByText(sentence('Saving $50.00 a month gets you to Flight training around December 2029, instead of May 2030.'))
    const chip = screen.getByLabelText<HTMLInputElement>('A month’s saving')
    expect(chip.value).toBe('50')
    expect(screen.getByText('From your question: change it to see another.')).toBeTruthy()

    const asked = { calls: fake.functions.calls.length, rpc: fake.rpcCalls.length }
    fireEvent.change(chip, { target: { value: '100' } })
    await screen.findByText(sentence('Saving $100.00 a month gets you to Flight training around August 2029, instead of May 2030.'))
    expect({ calls: fake.functions.calls.length, rpc: fake.rpcCalls.length }).toEqual(asked)
  })
})

describe('Ask with AI on', () => {
  it('marks what the AI read, and answers from core with the categories it named', async () => {
    const fake = forecastFakeWithGoals()
    aiReads(fake, { intent: 'compare', period: 'this_month', month: null, year: null, topic: null, amount: null }, ['Dining out'])
    open(fake)
    await ask('am i eating out more?')

    // 1–24 September against 1–24 August: $840.00 against $1,054.00.
    const card = await answerCard('Dining out: $214.00 less than the days before, $840.00 against $1,054.00.')
    expect(within(card).getByText(/I read that as: Against the time before · Dining out · This month/).textContent).toContain('✨')
    expect(within(card).getByText('1 – 24 Sep, against 1 – 24 Aug')).toBeTruthy()
    const [brief] = fake.functions.calls.filter((c) => c['action'] === 'run').map((c) => c['data'] as Record<string, unknown>)
    expect(Object.keys(brief!)).toEqual(['question', 'today', 'categories', 'topics'])
  })

  it('says it cannot answer, with questions it can', async () => {
    const fake = forecastFakeWithGoals()
    aiReads(fake, { intent: 'cannot', period: null, month: null, year: null, topic: null, amount: null })
    open(fake)
    await ask('Should I buy a boat?')

    await screen.findByText('I can’t answer that from your figures yet. Try one of these:')
    expect(screen.getAllByRole('button', { name: 'How much did I spend this month?' })).toHaveLength(1)
  })

  it('opens the Help article a how-to question is about', async () => {
    const fake = forecastFakeWithGoals()
    aiReads(fake, { intent: 'help', period: null, month: null, year: null, topic: 'statements', amount: null })
    open(fake)
    await ask('where do my card statements go')

    expect((await screen.findByRole('link', { name: 'Open this article' })).getAttribute('href')).toBe('#/help/statements')
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

  it('reads the payoff plan only for a debt-free question, and says when it needs a one-time update', async () => {
    const fake = forecastFakeWithGoals()
    open(fake)
    await ask('When will I be debt-free?')
    await screen.findByText(sentence('No debts on your payoff plan.'))
    cleanup()

    const missing = forecastFakeWithGoals()
    missing.fail('debts', '42P01')
    open(missing)
    await ask('How much did I spend on dining out in August?')
    await screen.findByText(sentence('You spent $1,054.00 on Dining out.'))
    await ask('When will I be debt-free?')
    await screen.findByText(/Your payoff plan needs a one-time update\./)
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
