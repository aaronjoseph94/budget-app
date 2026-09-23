import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet } from '../src/components/ui/sheet.js'

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
  it('is a modal dialog named by its title, and takes focus when it opens', () => {
    render(<Opener />)
    open()
    const dialog = screen.getByRole('dialog', { name: 'Groceries' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog)
    expect(document.body.style.overflow).toBe('hidden')
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
