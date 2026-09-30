import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '../src/components/ui/button.js'
import { Card } from '../src/components/ui/card.js'
import { expectNoAxeViolations } from './axe.js'

afterEach(cleanup)

// jsdom lays nothing out, so these check the classes that decide it; the
// preview harness measured the result at 320 and 390 px with text at 200%.
describe('Button at large text sizes (N58, A26)', () => {
  it('is never wider than its box, and wraps its label rather than spill', async () => {
    render(<Button>Where did my money go last month?</Button>)
    const classes = screen.getByRole('button').classList
    expect(classes.contains('max-w-full')).toBe(true)
    expect(classes.contains('whitespace-nowrap')).toBe(false)
    await expectNoAxeViolations()
  })

  it('grows to hold a wrapped label: every size sets a floor, not a height', () => {
    for (const size of ['default', 'sm', 'lg'] as const) {
      cleanup()
      render(<Button size={size}>Save</Button>)
      const classes = [...screen.getByRole('button').classList]
      expect(classes.some((c) => /^min-h-\d+$/.test(c)), size).toBe(true)
      expect(classes.filter((c) => /^h-\d+$/.test(c)), size).toEqual([])
    }
  })

  it('keeps 44 px for a finger whatever the size', () => {
    render(<Button size="sm">Edit</Button>)
    const classes = screen.getByRole('button').classList
    expect(classes.contains('pointer-coarse:min-h-11')).toBe(true)
    expect(classes.contains('pointer-coarse:min-w-11')).toBe(true)
  })
})

// FE-4-NEW: the light scheme's ring is the primary itself, so on a filled
// button a ring drawn flush was the fill grown 3 px, not a mark of focus.
describe('Button focus', () => {
  it('sets its ring apart from its own fill by a gap in the page colour', () => {
    render(<Button>Add</Button>)
    const classes = screen.getByRole('button').classList
    expect(classes.contains('focus-visible:ring-offset-2')).toBe(true)
    expect(classes.contains('focus-visible:ring-offset-background')).toBe(true)
  })
})

// Mockup A has no raised controls or cards: only the sign-in card casts a
// shadow (README), so neither part carries one by default.
describe('Mockup A is flat', () => {
  it('gives no Button variant and no Card a shadow', () => {
    for (const variant of ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const) {
      cleanup()
      render(<Button variant={variant}>Save</Button>)
      expect([...screen.getByRole('button').classList].filter((c) => c.startsWith('shadow')), variant).toEqual([])
    }
    cleanup()
    render(<Card data-testid="card">Words</Card>)
    expect([...screen.getByTestId('card').classList].filter((c) => c.startsWith('shadow'))).toEqual([])
  })
})
