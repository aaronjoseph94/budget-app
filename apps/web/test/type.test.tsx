import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Figure, MonthTitle } from '../src/components/ui/type.js'
import { expectNoAxeViolations } from './axe.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let host: HTMLElement | null = null
let root: Root | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  host = null
  root = null
})

function render(node: ReactNode): HTMLElement {
  host = document.createElement('div')
  document.body.append(host)
  const mounted = createRoot(host)
  root = mounted
  act(() => mounted.render(node))
  return host
}

describe('MonthTitle', () => {
  // The month title is the page's heading, not decoration: a screen reader
  // lands on it first, so it must be the one level-1 heading.
  it('is the page heading, in the system face at 32px bold and its readable ink (ADR 0010)', async () => {
    const el = render(<MonthTitle>September 2026</MonthTitle>)
    const heading = within(el).getByRole('heading', { level: 1, name: 'September 2026' })
    expect(heading.classList.contains('text-[min(2rem,15vw)]')).toBe(true)
    expect(heading.classList.contains('font-bold')).toBe(true)
    expect(heading.classList.contains('text-title-ink')).toBe(true)
    await expectNoAxeViolations()
  })
})

describe('Figure', () => {
  // cn() is a plain join, so the base must not set what a caller sets: if it
  // carried a size or a colour, which one won would depend on stylesheet order.
  it('adds only tabular figures, leaving size and colour to the caller', () => {
    const el = render(<Figure className="text-4xl text-income">$248.31</Figure>)
    const figure = within(el).getByText('$248.31')
    expect([...figure.classList]).toEqual(['tnum', '[overflow-wrap:anywhere]', 'text-4xl', 'text-income'])
  })
})
