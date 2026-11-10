import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { rememberScroll, returning } from '../src/scroll-memory.js'

/**
 * Back landed at the top of the page: every screen change scrolled there,
 * history moves included (bug bash, phone). jsdom lays nothing out, so the
 * page's height and its scroll are set here, and scrollTo is watched.
 */
let y = 0
const scrolledTo = () => vi.mocked(window.scrollTo).mock.calls.map(([options]) => (options as ScrollToOptions).top)

function scroll(to: number): void {
  y = to
  window.dispatchEvent(new Event('scroll'))
}

/** The next hashchange, as a link, Back or Forward makes. */
function moved(): Promise<void> {
  return new Promise((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }))
}

beforeAll(() => {
  Object.defineProperty(window, 'scrollY', { get: () => y, configurable: true })
  Object.defineProperty(document.documentElement, 'scrollHeight', { get: () => 5000, configurable: true })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})
afterAll(() => {
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('rememberScroll', () => {
  it('starts a new address at the top, and puts Back and Forward where they were', async () => {
    const opened = moved()
    window.location.hash = '#/ledger/2026-09'
    await opened
    rememberScroll()
    scroll(1500)

    // A new address: not a return, so the screen scrolls to the top itself.
    let next = moved()
    window.location.hash = '#/more'
    await next
    expect(returning()).toBe(false)
    scroll(200)

    next = moved()
    window.history.back()
    await next
    expect(window.location.hash).toBe('#/ledger/2026-09')
    expect(returning()).toBe(true)
    await vi.waitFor(() => expect(scrolledTo()).toEqual([1500]))
    scroll(1500)

    next = moved()
    window.history.forward()
    await next
    expect(returning()).toBe(true)
    await vi.waitFor(() => expect(scrolledTo()).toEqual([1500, 200]))

    // A new address after a return is new again, and its page starts at the top.
    next = moved()
    window.location.hash = '#/month'
    await next
    expect(returning()).toBe(false)
  })

  it('gives up putting a position back as soon as the owner touches the page', async () => {
    scroll(900)
    let next = moved()
    window.location.hash = '#/review'
    await next
    scroll(0)
    const before = scrolledTo().length
    next = moved()
    window.history.back()
    await next
    window.dispatchEvent(new Event('touchstart'))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(scrolledTo().slice(before)).toEqual([])
  })
})
