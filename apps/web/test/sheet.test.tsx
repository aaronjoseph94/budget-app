import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet } from '../src/components/ui/sheet.js'
import { expectNoAxeViolations } from './axe.js'

function Opener({ title = 'Groceries' }: { title?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Sheet title={title} subtitle="September 2026" onClose={() => setOpen(false)}>
          <p>Inside</p>
        </Sheet>
      ) : null}
    </>
  )
}

function open(): HTMLElement {
  const opener = screen.getByRole('button', { name: 'Open' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

afterEach(cleanup)

describe('Sheet', () => {
  it('is a modal dialog named by its title, and takes focus when it opens', async () => {
    render(<Opener />)
    open()
    const dialog = screen.getByRole('dialog', { name: 'Groceries' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog)
    expect(document.body.style.overflow).toBe('hidden')
    await expectNoAxeViolations()
  })

  it('closes on Escape, the close button and the backdrop, giving focus and scrolling back', () => {
    render(<Opener />)
    const opener = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')

    open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()

    open()
    const backdrop = screen.getByRole('dialog').previousElementSibling
    if (backdrop === null) throw new Error('no backdrop')
    fireEvent.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps Tab and Shift+Tab inside the open sheet', () => {
    render(
      <>
        <button type="button">Behind</button>
        <Sheet title="Groceries" onClose={() => undefined}>
          <button type="button">Move to…</button>
        </Sheet>
      </>,
    )
    const close = screen.getByRole('button', { name: 'Close' })
    const move = screen.getByRole('button', { name: 'Move to…' })
    // Opening focuses the panel; Shift+Tab from there goes to its last control.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(move)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(move)
    screen.getByRole('button', { name: 'Behind' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it('shows a title written as markup as text', () => {
    render(<Opener title="<b>Dinner & drinks</b>" />)
    open()
    expect(screen.getByRole('heading', { name: '<b>Dinner & drinks</b>' })).toBeTruthy()
    expect(document.querySelector('[role="dialog"] b')).toBeNull()
  })
})

/**
 * The Back gesture with a sheet open left the screen and dropped what was
 * typed (bug bash, phone). Each sheet now stands on a history entry of its
 * own at the same address. jsdom's history moves land a moment later, so
 * each step waits for its popstate or hashchange.
 */
describe('Sheet and the Back gesture', () => {
  const popped = () => new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }))
  const moved = () => new Promise<void>((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }))
  const settled = () => new Promise((resolve) => setTimeout(resolve, 0))
  // A fresh pair of addresses for each test: setting the address it already has moves nothing.
  let run = 0
  let before = ''
  let here = ''
  async function at(hash: string): Promise<void> {
    const there = moved()
    window.location.hash = hash
    await there
  }
  async function onScreen(): Promise<void> {
    run += 1
    before = `#/before-${run}`
    here = `#/savings-${run}`
    await at(before)
    await at(here)
  }
  async function back(): Promise<void> {
    const landed = popped()
    window.history.back()
    await landed
  }

  it('closes on Back, staying on the screen, with focus back on what opened it', async () => {
    await onScreen()
    render(<Opener />)
    const opener = open()
    await back()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe(here)
    expect(document.activeElement).toBe(opener)
    // The next Back leaves the screen.
    await back()
    expect(window.location.hash).toBe(before)
  })

  it('takes its entry back off when closed by its own button, so Back leaves the screen at once', async () => {
    await onScreen()
    render(<Opener />)
    open()
    const off = popped()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await off
    expect(window.location.hash).toBe(here)
    await back()
    expect(window.location.hash).toBe(before)
  })

  it('opens a second sheet at once after the first, and Back closes the second', async () => {
    await onScreen()
    render(<Opener />)
    open()
    fireEvent.keyDown(document, { key: 'Escape' })
    open()
    // The first sheet's entry comes off before the second's goes on.
    await popped()
    await settled()
    expect(screen.getByRole('dialog')).toBeTruthy()
    await back()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.hash).toBe(here)
    await back()
    expect(window.location.hash).toBe(before)
  })

  it('steps over the entry a sheet left when it moved to another screen', async () => {
    await onScreen()
    const { unmount } = render(<Opener />)
    open()
    // "Show me" in Help's sheet: a link to another screen, which takes the sheet with it.
    await at(`#/help-${run}`)
    unmount()
    await settled()
    const stepped = popped()
    await back()
    expect(window.location.hash).toBe(here)
    // That entry is stepped over, so the next Back leaves the screen
    // rather than land on the sheet's old entry and change nothing.
    await stepped
    await popped()
    await back()
    expect(window.location.hash).toBe(before)
  })
})
