import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { cents } from '@budget/money-primitives'
import { CoachText } from '../src/coach/words.js'

afterEach(cleanup)

describe('a figure in coach words (security-b-01)', () => {
  it('is drawn in its own direction, so nothing around it can reverse it', () => {
    const facts = { A: { subject: { label: 'Groceries' }, figures: { now: { unit: 'cents' as const, value: cents(1234) } } } }
    const { container } = render(<p><CoachText text="You spent {{A.now}} on {{A.name}}." facts={facts} /></p>)

    const figure = container.querySelector('.tnum')
    expect(figure?.tagName).toBe('BDI')
    expect(figure?.textContent).toBe('$12.34')
    expect(container.textContent).toBe('You spent $12.34 on Groceries.')
  })
})
