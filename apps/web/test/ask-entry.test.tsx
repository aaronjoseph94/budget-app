import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { HelpButton } from '../src/help/HelpButton.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The ways into Ask (plan A24): the Coach's ask box, "Ask about this" in a
 * screen's help sheet, and the last five questions kept on this device.
 * The Forecast's worked example, invented data only, with AI off.
 */
const sentence = (text: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === text
const DINING = 'You spent $1,054.00 on Dining out.'

function open(hash: string) {
  window.location.hash = hash
  renderScreen(<Shell />, forecastFakeWithGoals())
}

async function ask(question: string) {
  fireEvent.change(await screen.findByRole('textbox', { name: 'Your question' }), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }))
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  // Each screen these tests open draws once first, so no find races its code running cold (N87).
  await warmScreen('#/ask', 'Ask', { fake: forecastFakeWithGoals(), text: 'Try asking' })
  await warmScreen('#/coach', 'Coach', { fake: forecastFakeWithGoals(), text: 'Ask anything about your money' })
  await warmScreen('#/forecast', 'Forecast')
  // The help sheet is a lazy part of its own, opened by a tap, so the
  // screen's warming never draws it. setup-dom.ts fetches its chunk; opened
  // once here, its code has also run once, so the sheet renders at once in
  // the test and Ask about this is found well inside the find's one second.
  render(<HelpButton screen="forecast" />)
  fireEvent.click(screen.getByRole('button', { name: 'Help with this screen' }))
  await new Promise<void>((resolve) => {
    const shown = () => document.body.textContent?.includes('Ask about this') === true
    if (shown()) return resolve()
    const watch = new MutationObserver(() => {
      if (shown()) {
        watch.disconnect()
        resolve()
      }
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(EXAMPLE_TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  localStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
  localStorage.clear()
})

describe('the Coach’s ask box', () => {
  it('carries the question to Ask, which answers it', async () => {
    open('#/coach')
    fireEvent.change(await screen.findByRole('textbox', { name: /Ask anything about your money/ }), { target: { value: 'How much did I spend on dining out in August?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ask' }))

    expect(await screen.findByText(sentence(DINING))).toBeTruthy()
    expect(window.location.hash).toBe('#/ask')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Your question' }).value).toBe('How much did I spend on dining out in August?')
    await expectNoAxeViolations()
  })
})

describe('Ask about this', () => {
  it('opens Ask from a screen’s help sheet, with that screen as its subject', async () => {
    open('#/forecast')
    fireEvent.click(await screen.findByRole('button', { name: 'Help with this screen' }))
    const link = await screen.findByRole('link', { name: /Ask about this/ })
    expect(link.getAttribute('href')).toBe('#/ask/coach')

    cleanup()
    open('#/ask/coach')
    expect(await screen.findByText(/About: Coach, Ask and the forecast\./)).toBeTruthy()
    const suggested = within(screen.getByRole('region', { name: 'Suggested questions' })).getAllByRole('button').map((b) => b.textContent)
    expect(suggested.slice(0, 3)).toEqual(['How did last month go?', 'Where will this month end?', 'How much is safe to spend today?'])
  })

  it('offers no Ask about this on Ask’s own help', async () => {
    open('#/ask')
    fireEvent.click(await screen.findByRole('button', { name: 'Help with this screen' }))
    await screen.findByRole('link', { name: 'Show me' })
    expect(screen.queryByRole('link', { name: /Ask about this/ })).toBeNull()
  })
})

describe('the last five questions', () => {
  it('are kept on this device, newest first, asked again with a tap, and cleared', async () => {
    open('#/ask')
    for (const q of ['q one?', 'q two?', 'q three?', 'q four?', 'q five?', 'How much did I spend on dining out in August?']) {
      await ask(q)
      await screen.findByRole('button', { name: q })
    }
    cleanup()
    open('#/ask')
    const kept = within(await screen.findByRole('region', { name: 'Your last questions' })).getAllByRole('button', { name: /\?$/ })
    expect(kept.map((b) => b.textContent)).toEqual(['How much did I spend on dining out in August?', 'q five?', 'q four?', 'q three?', 'q two?'])

    fireEvent.click(kept[0]!)
    expect(await screen.findByText(sentence(DINING))).toBeTruthy()
    // e2e-setup-06: pressed from the keyboard, focus goes to the question box, not <body>.
    const clear = screen.getByRole('button', { name: 'Clear these' })
    clear.focus()
    fireEvent.click(clear)
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your last questions' })).toBeNull())
    expect(localStorage.getItem('budget.ask.recent')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Your question' }))
  })

  it('still answers when the browser refuses to keep them', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage refused')
    })
    open('#/ask')
    await ask('How much did I spend on dining out in August?')
    expect(await screen.findByText(sentence(DINING))).toBeTruthy()
  })
})
