import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddScreen } from '../src/screens/AddScreen.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * What Type it refuses, and in which words. A computer's date field reads
 * "26" typed for the year as the year 0026, a charge no screen could then
 * find; a statement's dates and Just type it's already stop at 1900. And an
 * amount past the most the app keeps is called too large, as every other
 * money field calls it, not "not a number". Sunday 27 September 2026.
 */
const TODAY = new Date(2026, 8, 27, 12)

function seeded(): FakeSupabase {
  const fake = createFakeSupabase({ categories: [{ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }] })
  fake.rpcReplies.add_typed_transaction = null
  return fake
}

async function typed(fields: { amount: string; date?: string; what?: string }) {
  fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
  fireEvent.change(screen.getByLabelText('Amount'), { target: { value: fields.amount } })
  fireEvent.change(screen.getByLabelText('What was it?'), { target: { value: fields.what ?? 'Dentist' } })
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'food' } })
  if (fields.date !== undefined) fireEvent.change(screen.getByLabelText('Date'), { target: { value: fields.date } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Type it', () => {
  it.each(['0026-09-27', '0001-01-01', '1899-12-31'])('adds nothing dated %s, and asks for the full year', async (date) => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    await typed({ amount: '40', date })
    expect(await screen.findByText(/Still needed: a date with its full year, like 2026\./)).toBeTruthy()
    expect(fake.rpcCalls.filter((c) => c.name === 'add_typed_transaction')).toEqual([])
  })

  it('still asks for a date no later than today', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    await typed({ amount: '40', date: '2026-09-28' })
    expect(await screen.findByText(/Still needed: a date no later than today\./)).toBeTruthy()
  })

  it('calls an amount past the limit too large, and names the limit', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    await typed({ amount: '1000000000.00' })
    expect(await screen.findByText('That amount is too large. The most you can type is $999,999,999.99.')).toBeTruthy()
    expect(screen.queryByText('That amount is not a number of dollars and cents.')).toBeNull()
    expect(fake.rpcCalls.filter((c) => c.name === 'add_typed_transaction')).toEqual([])
  })
})

describe('Just type it', () => {
  async function justType(text: string) {
    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    fireEvent.change(await screen.findByLabelText('Just type it'), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
    await screen.findByRole('button', { name: 'Fill in' })
  }

  it('says the date is still to choose when the line named a day it will not guess', async () => {
    const fake = createFakeSupabase({
      categories: [{ id: 'food', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: null }],
      merchant_rules: [{ match_merchant: 'CORNER MARKET', category_id: 'food' }],
    })
    renderScreen(<AddScreen />, fake)
    await justType('CORNER MARKET 20 9/10')
    expect(screen.getByLabelText<HTMLInputElement>('Date').value).toBe('')
    expect(await screen.findByText('Filled in, except the date. Choose it, then press Add.')).toBeTruthy()
    expect(screen.queryByText('Filled in from what you typed. Check it, then press Add.')).toBeNull()
  })

  it('keeps What was it? to the 120 characters the field itself allows', async () => {
    renderScreen(<AddScreen />, seeded())
    await justType(`${'coffee beans '.repeat(20)}4.50`)
    expect(screen.getByLabelText<HTMLInputElement>('What was it?').value.length).toBeLessThanOrEqual(120)
  })
})
