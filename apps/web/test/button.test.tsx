import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Button } from '../src/components/ui/button.js'

afterEach(cleanup)

// jsdom lays nothing out, so these check the classes that decide it; the
// preview harness measured the result at 320 and 390 px with text at 200%.
describe('Button at large text sizes (N58, A26)', () => {
  it('is never wider than its box, and wraps its label rather than spill', () => {
    render(<Button>Where did my money go last month?</Button>)
    const classes = screen.getByRole('button').classList
    expect(classes.contains('max-w-full')).toBe(true)
    expect(classes.contains('whitespace-nowrap')).toBe(false)
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
