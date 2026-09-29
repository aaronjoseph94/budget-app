import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignIn } from '../src/auth.js'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import { ReviewScreen } from '../src/screens/ReviewScreen.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * Where keyboard focus goes when what held it goes away (FE-6). Left alone
 * it falls to <body>, and a keyboard or screen-reader user starts again from
 * the top of the page.
 */

const cat = (id: string, name: string, kind: Category['kind']): Category => ({ id, name, kind, sort_order: 0, weekly_budget_cents: null })

function month(): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries', 'variable')],
    transactions: [
      { id: 't1', posted_on: '2026-09-02', amount_cents: -10000, merchant_raw: 'SYNTHETIC MARKET', category_id: 'groceries', source: 'card_pdf' },
    ],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 8, 23, 12))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('focus after an editor in a row closes', () => {
  it('goes back to the budget button when Escape closes the editor', async () => {
    renderScreen(<MonthScreen month="2026-09" />, month())
    fireEvent.click(await screen.findByRole('button', { name: /^Budget for Groceries, / }))
    const field = screen.getByRole('textbox', { name: /^Budget for Groceries in / })
    fireEvent.keyDown(field, { key: 'Escape' })

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Budget for Groceries, / }))
    await expectNoAxeViolations()
  })

  it('goes back to the budget button once a budget is saved', async () => {
    renderScreen(<MonthScreen month="2026-09" />, month())
    fireEvent.click(await screen.findByRole('button', { name: /^Budget for Groceries, / }))
    fireEvent.change(screen.getByRole('textbox', { name: /^Budget for Groceries in / }), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))

    const opener = await screen.findByRole('button', { name: 'Budget for Groceries, $300.00' })
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })

  it('goes back to the starting balance when its editor is cancelled', async () => {
    renderScreen(<MonthScreen month="2026-09" />, month())
    fireEvent.click(await screen.findByRole('button', { name: /^Starting balance for September, / }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Starting balance for September, / }))
  })
})

describe('focus after a review card is filed', () => {
  it('moves to the message saying what happened, not to the page', async () => {
    const fake = createFakeSupabase({
      categories: [cat('c1', 'Groceries', 'variable')],
      ingest_candidates: [
        { id: 'p1', posted_on: '2026-09-09', amount_cents: -1349, merchant: 'LITWARE COFFEE', merchant_raw: 'LITWARE COFFEE', status: 'pending' },
      ],
    })
    renderScreen(<ReviewScreen />, fake)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Category' }), { target: { value: 'c1' } })
    fireEvent.click(screen.getByRole('button', { name: /Approve/ }))

    const said = await screen.findByText(/^Added\./)
    await waitFor(() => expect(document.activeElement).toBe(said.closest('[tabindex="-1"]')))
  })
})

describe('focus after signing in fails', () => {
  it('moves to the reason it failed', async () => {
    const fake = createFakeSupabase()
    render(<SignIn supabase={fake.client} />)
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'you@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    const reason = await screen.findByRole('alert')
    await waitFor(() => expect(document.activeElement).toBe(reason))
    // And tied to both fields, which are marked as the ones refused (FE-8).
    for (const name of ['Email address', 'Password']) {
      const field = screen.getByLabelText(name)
      expect(field.getAttribute('aria-invalid')).toBe('true')
      expect(field.getAttribute('aria-describedby')).toBe(reason.id)
    }
  })
})

describe('the sign-in page (FE-14)', () => {
  it('is a main landmark, so a screen reader can jump to it', () => {
    render(<SignIn supabase={createFakeSupabase().client} />)
    expect(screen.getByRole('main').textContent).toContain('Email address')
  })

  // Mockup A: the name over a centred card, which holds the whole form.
  it('names itself Budget over one card holding the form, with no axe violations', async () => {
    render(<SignIn supabase={createFakeSupabase().client} />)
    const title = screen.getByRole('heading', { level: 1, name: 'Budget' })
    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')!
    expect(title.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(form.contains(screen.getByLabelText('Email address'))).toBe(true)
    expect(form.contains(screen.getByRole('button', { name: 'Email me a link instead' }))).toBe(true)
    await expectNoAxeViolations()
  })
})

describe('the sign-in fields (FE-1)', () => {
  it('are the app\'s own fields, 44 px tall for a finger', () => {
    render(<SignIn supabase={createFakeSupabase().client} />)
    for (const name of ['Email address', 'Password']) {
      const classes = screen.getByLabelText(name).classList
      expect([classes.contains('h-11'), classes.contains('pointer-coarse:min-h-11')], name).toEqual([true, true])
    }
  })
})
