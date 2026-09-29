import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Badge } from '../src/components/ui/feedback.js'
import { MonthTitle } from '../src/components/ui/type.js'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

// With the phone's text at 200% a 320 px screen holds about 160 px of
// normal-size text (N58, A26). jsdom lays nothing out, so these check the
// classes that decide it; the preview harness measured the result.
describe('shared pieces with the phone’s text at 200%', () => {
  it('a badge keeps one line where it fits, but is never wider than its box', async () => {
    render(<Badge>Based on 6 months</Badge>)
    const classes = screen.getByText('Based on 6 months').classList
    expect(classes.contains('max-w-full')).toBe(true)
    expect(classes.contains('shrink-0')).toBe(true)
    expect(classes.contains('whitespace-nowrap')).toBe(false)
    await expectNoAxeViolations()
  })

  it('the Month’s title shrinks to the screen before "September" breaks', () => {
    render(<MonthTitle>September 2026</MonthTitle>)
    const classes = screen.getByRole('heading', { level: 1 }).classList
    expect(classes.contains('text-[min(2rem,15vw)]')).toBe(true)
    expect(classes.contains('[overflow-wrap:anywhere]')).toBe(true)
  })
})
