import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { within } from '@testing-library/dom'
import { afterEach, describe, expect, it } from 'vitest'
import { Figure, MonthTitle } from '../src/components/ui/type.js'
import { Stat } from '../src/ui.js'
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
    expect([...figure.classList]).toEqual(['tnum', 'whitespace-nowrap', 'text-4xl', 'text-income'])
  })

  // At 320 px "-$2,771.99" put its minus sign on a line of its own, and
  // "$12,345.67" broke after the 6: an amount never wraps inside itself.
  // The box around it gives way instead (bug bash, phone).
  it('keeps an amount on one line, minus sign and all', () => {
    const el = render(<Figure>-$2,771.99</Figure>)
    const classes = [...within(el).getByText('-$2,771.99').classList]
    expect(classes).toContain('whitespace-nowrap')
    expect(classes.filter((c) => /^(break-|wrap-|\[overflow-wrap)/.test(c))).toEqual([])
  })
})

describe('Stat', () => {
  it('keeps its value on one line, smaller in a narrow cell, and scrolls it in its own box past that', () => {
    const el = render(<Stat label="Money out" value="-$12,345.67" tone="spend" />)
    const value = within(el).getByText('-$12,345.67')
    expect([...value.classList]).toEqual(expect.arrayContaining(['whitespace-nowrap', 'overflow-x-auto', '@max-[9.5rem]:text-base']))
    expect(value.parentElement?.classList.contains('@container')).toBe(true)
    expect(value.parentElement?.classList.contains('min-w-0')).toBe(true)
  })
})
