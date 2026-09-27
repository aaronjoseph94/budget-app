import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { EXAMPLE_TODAY, forecastFakeWithGoals } from './forecast-seed.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'

/**
 * The ways into Ask (plan A24): the Coach's ask box, and the last five
 * questions kept on this device.
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
  // Each screen these tests open draws once first, so no find races a cold chunk (N87).
  await warmScreen('#/ask', 'Ask', { fake: forecastFakeWithGoals(), text: 'Try asking' })
  await warmScreen('#/coach', 'Coach', { fake: forecastFakeWithGoals(), text: 'Ask anything about your money' })
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
    fireEvent.click(screen.getByRole('button', { name: 'Clear these' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Your last questions' })).toBeNull())
    expect(localStorage.getItem('budget.ask.recent')).toBeNull()
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
