import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Alert } from '../src/components/ui/feedback.js'
import { describeBudgetFailure, describeWriteFailure } from '../src/format.js'

afterEach(cleanup)

describe('a failure that needs a one-time update (N28, N69)', () => {
  it('says so without a file name, and links to Help → One-time updates wherever it shows', () => {
    const said = describeBudgetFailure('read', { code: 'PGRST205' })
    expect(said).toBe('Budgets need a one-time update, so this month cannot be shown. (code PGRST205)')
    render(<Alert tone="error" title="Could not load this month">{said}</Alert>)
    expect(screen.getByRole('link', { name: 'See One-time updates' }).getAttribute('href')).toBe('#/help/updates')
  })

  it.each(['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'])('reads %s in any write as a missing update, not "something went wrong"', (code) => {
    expect(describeWriteFailure({ code })).toBe(`This needs a one-time update, so nothing was saved. (code ${code})`)
  })

  it('adds no link to any other failure', () => {
    render(<Alert tone="error">{describeWriteFailure({ code: '42501' })}</Alert>)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
