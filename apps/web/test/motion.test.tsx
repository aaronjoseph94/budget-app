import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Sheet } from '../src/components/ui/sheet.js'
import { Alert, SavedNote } from '../src/components/ui/feedback.js'
import { Figure } from '../src/components/ui/type.js'

afterEach(cleanup)

// The stylesheet's own rules are read in motion-css.test.ts: this DOM project gets no CSS text.
describe('Motion on the components (after transitions.dev)', () => {
  it('opens a sheet with its backdrop fading in and its panel rising', () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open
          </button>
          {open ? (
            <Sheet title="Groceries" onClose={() => setOpen(false)}>
              <p>Inside</p>
            </Sheet>
          ) : null}
        </>
      )
    }
    render(<Opener />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    const dialog = screen.getByRole('dialog', { name: 'Groceries' })
    expect(dialog.classList.contains('sheet-in')).toBe(true)
    expect(dialog.parentElement?.querySelector('[aria-hidden="true"]')?.classList.contains('backdrop-in')).toBe(true)
  })

  it('brings a notice and a saved note in', () => {
    render(
      <>
        <Alert tone="error" title="Could not save">
          Nothing was saved.
        </Alert>
        <SavedNote>Saved.</SavedNote>
      </>,
    )
    expect(screen.getByRole('alert').classList.contains('notice-in')).toBe(true)
    expect(screen.getByText('Saved.').classList.contains('notice-in')).toBe(true)
  })

  // A figure fades to its new value only when it changes, never on first
  // draw, so a screen opening does not flicker every number at once.
  it('cross-fades a figure when its value changes, and only then', () => {
    const { rerender } = render(<Figure data-testid="f">$12.50</Figure>)
    const first = screen.getByTestId('f')
    expect(first.classList.contains('figure-change')).toBe(false)
    rerender(<Figure data-testid="f">$12.50</Figure>)
    expect(screen.getByTestId('f')).toBe(first)
    rerender(<Figure data-testid="f">$40.00</Figure>)
    const changed = screen.getByTestId('f')
    expect(changed).not.toBe(first)
    expect(changed.classList.contains('figure-change')).toBe(true)
    expect(changed.textContent).toBe('$40.00')
  })
})
