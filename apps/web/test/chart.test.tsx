import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
