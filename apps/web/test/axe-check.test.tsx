import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

// The helper every screen test calls. A check never seen to fail has not
// been tested, so each case here is a page axe must refuse.
describe('expectNoAxeViolations', () => {
  it('passes a labelled field and a named button', async () => {
    render(
      <form>
        <label htmlFor="amount">Amount</label>
        <input id="amount" inputMode="decimal" />
        <button type="submit">Save</button>
      </form>,
    )
    await expectNoAxeViolations()
  })

  it('refuses a button with no name', async () => {
    render(<button type="button" />)
    await expect(expectNoAxeViolations()).rejects.toThrow(/button-name/)
  })

  it('refuses a field with no label', async () => {
    render(<input type="text" />)
    await expect(expectNoAxeViolations()).rejects.toThrow(/label/)
  })

  it('looks outside the container, where sheets are drawn', async () => {
    const sheet = document.createElement('img')
    sheet.src = 'x.png'
    document.body.appendChild(sheet)
    try {
      render(<p>The screen itself is fine</p>)
      await expect(expectNoAxeViolations()).rejects.toThrow(/image-alt/)
    } finally {
      sheet.remove()
    }
  })
})
