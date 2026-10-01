import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { spendingDoughnut } from '@budget/chart-specs'
import { SvgChart } from '../src/components/ui/chart.js'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

// The one place the app puts a string into the page as markup: whatever a
// category is called, it must arrive as text.
describe('SvgChart', () => {
  const NAME = '<img src=x onerror=a> & co'
  const svg = spendingDoughnut({
    id: 'c1',
    title: 'Spending',
    description: `${NAME}: all of it.`,
    slices: [{ label: NAME, valueText: '$1.00 · 100%', shareBp: 10_000, listIndex: 0 }],
  })

  it('draws the chart as an image named by its title and described in words', async () => {
    render(<SvgChart svg={svg} />)
    const chart = screen.getByRole('img', { name: 'Spending' })
    expect(chart.getAttribute('aria-describedby')).toBe('c1-desc')
    expect(document.getElementById('c1-desc')?.textContent).toBe(`${NAME}: all of it.`)
    await expectNoAxeViolations()
  })

  it('shows a category name with < and & as text, never as an element', () => {
    const { container } = render(<SvgChart svg={svg} />)
    expect(screen.getByText(NAME, { selector: 'text' })).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('[onerror]')).toHaveLength(0)
  })
})

// V1: a chart's words show at one size whatever box it is drawn in.
describe('SvgChart, drawn to its box', () => {
  const draw = (width: number | undefined) =>
    spendingDoughnut({ id: 'c2', title: 'Spending', description: 'd', width, slices: [{ label: 'Food', valueText: '$1.00 · 100%', shareBp: 10_000, listIndex: 0 }] })

  it('is drawn on the width that shows its text at 13 px in the box it measures', () => {
    const watched: Element[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe(el: Element) {
        watched.push(el)
      }
      disconnect() {}
    })
    const size = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 222 } as DOMRect)
    render(<SvgChart svg={draw} />)
    expect(screen.getByRole('img', { name: 'Spending' }).getAttribute('viewBox')).toMatch(/^0 0 2050 /)
    expect(watched).toHaveLength(1)
    size.mockRestore()
    vi.unstubAllGlobals()
  })

  it('is drawn at its designed width where the browser cannot measure', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<SvgChart svg={draw} />)
    expect(screen.getByRole('img', { name: 'Spending' }).getAttribute('viewBox')).toMatch(/^0 0 3000 /)
    vi.unstubAllGlobals()
  })
})
