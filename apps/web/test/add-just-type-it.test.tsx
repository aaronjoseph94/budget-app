import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuickAddBrief } from '@budget/schema'
import { AddScreen } from '../src/screens/AddScreen.js'
import { aiStatusReply, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

/** Just type it on Add (plan A22). Sunday 27 September 2026 is today; shop names are invented. */
const TODAY = new Date(2026, 8, 27, 12)

function seeded(): FakeSupabase {
  const fake = createFakeSupabase({
    categories: [
      { id: 'c-coffee', name: 'Coffee', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
      { id: 'c-pay', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
    ],
    merchant_rules: [{ match_merchant: 'LITWARE COFFEE', category_id: 'c-coffee' }],
  })
  fake.rpcReplies.add_typed_transaction = null
  return fake
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** AI on through the receipts key, and a helper that answers each line with `reply(brief)`. */
function aiOn(fake: FakeSupabase, reply: (brief: QuickAddBrief) => Record<string, unknown>) {
  const [gemini, ...rest] = fake.functions.aiStatus.services
  fake.functions.aiStatus = aiStatusReply({ services: [{ ...gemini!, source: 'secret', hint: 'abcd' }, ...rest] })
  fake.functions.ai = (body) =>
    body['action'] !== 'run'
      ? json(fake.functions.aiStatus)
      : json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(reply(body['data'] as QuickAddBrief)) })
}

const field = (label: string) => screen.getByLabelText<HTMLInputElement | HTMLSelectElement>(label)
const runs = (fake: FakeSupabase) => fake.functions.calls.filter((c) => c['action'] === 'run')

async function justType(text: string) {
  fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
  fireEvent.change(await screen.findByLabelText('Just type it'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
  await screen.findByRole('button', { name: 'Fill in' })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Just type it with AI off', () => {
  it('fills the form from the parser alone, and saves nothing until Add', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)

    await justType('coffee 4.50 yesterday')
    expect(await screen.findByText(/Turn on free AI to have the rest filled in\./)).toBeTruthy()
    expect([field('Amount').value, field('What was it?').value, field('Date').value, field('Category').value]).toEqual(['4.50', 'coffee', '2026-09-26', ''])
    expect(screen.queryByText('Read by AI: check it')).toBeNull()
    expect(fake.rpcCalls).toEqual([])

    fireEvent.change(field('Category'), { target: { value: 'c-coffee' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await screen.findByText('Added $4.50 — coffee.')
    expect(fake.rpcCalls.map((c) => [c.name, c.args.p_amount_cents, c.args.p_posted_on, c.args.p_category])).toEqual([
      ['add_typed_transaction', -450, '2026-09-26', 'c-coffee'],
    ])
    await expectNoAxeViolations()
  })

  it('files a shop by its learned rule and asks the AI nothing when nothing is empty', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)

    await justType('Litware Coffee 5.25')
    await screen.findByText('Filled in from what you typed. Check it, then press Add.')
    expect([field('Amount').value, field('Category').value, field('Date').value]).toEqual(['5.25', 'c-coffee', '2026-09-27'])
    expect(runs(fake)).toEqual([])
  })

  it('reads money in as I received', async () => {
    renderScreen(<AddScreen />, seeded())

    await justType('got paid 2100')
    await waitFor(() => expect(field('Amount').value).toBe('2100.00'))
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'I received' }).checked).toBe(true)
  })

  it('says the AI helper needs a one-time update when it is not installed, and still fills what it read', async () => {
    const fake = seeded()
    fake.functions.ai = null
    renderScreen(<AddScreen />, fake)

    await justType('lunch 14 monday')
    expect(await screen.findByRole('link', { name: 'See One-time updates' })).toBeTruthy()
    expect(screen.getByText(/The AI helper needs a one-time update to fill in the rest\./)).toBeTruthy()
    expect([field('Amount').value, field('What was it?').value, field('Date').value]).toEqual(['14.00', 'lunch', '2026-09-21'])
  })
})

describe('Just type it with AI on', () => {
  it('asks only about what is empty, and labels an amount the AI read from the owner’s words', async () => {
    const fake = seeded()
    const briefs: QuickAddBrief[] = []
    aiOn(fake, (brief) => {
      briefs.push(brief)
      return { amount: '12', category: 'c1', date: null, shop: null, flow: null }
    })
    renderScreen(<AddScreen />, fake)

    await justType('3 coffees 12')
    expect(await screen.findByText('Read by AI: check it')).toBeTruthy()
    expect([field('Amount').value, field('Category').value, field('What was it?').value]).toEqual(['12.00', 'c-coffee', '3 coffees'])
    expect(briefs).toEqual([
      { text: '3 coffees 12', today: '2026-09-27', missing: ['amount', 'category', 'flow'], categories: [{ alias: 'c1', name: 'Coffee', list: 'variable' }, { alias: 'c2', name: 'Pay', list: 'income' }] },
    ])
    expect(fake.rpcCalls).toEqual([])

    fireEvent.change(field('Amount'), { target: { value: '12.50' } })
    expect(screen.queryByText('Read by AI: check it')).toBeNull()
  })

  it('drops an amount the AI gives that is not in the owner’s words', async () => {
    const fake = seeded()
    aiOn(fake, () => ({ amount: '36', category: null, date: null, shop: null, flow: null }))
    renderScreen(<AddScreen />, fake)

    await justType('3 coffees 12')
    await screen.findByText(/^Filled in what the app could read; fill in the rest/)
    expect(field('Amount').value).toBe('')
    expect(screen.queryByText('Read by AI: check it')).toBeNull()
  })
})

describe('Just type it, a slow AI (FE-4)', () => {
  it('leaves alone a form the owner changed while the AI was reading', async () => {
    const fake = seeded()
    const [gemini, ...rest] = fake.functions.aiStatus.services
    fake.functions.aiStatus = aiStatusReply({ services: [{ ...gemini!, source: 'secret', hint: 'abcd' }, ...rest] })
    let answer: (r: Response) => void = () => undefined
    fake.functions.ai = (body) =>
      body['action'] !== 'run' ? json(fake.functions.aiStatus) : new Promise<Response>((done) => (answer = done))
    renderScreen(<AddScreen />, fake)

    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    fireEvent.change(await screen.findByLabelText('Just type it'), { target: { value: '3 coffees 12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
    await screen.findByRole('button', { name: 'Reading…' })
    await waitFor(() => expect(runs(fake).length).toBe(1))
    fireEvent.change(field('What was it?'), { target: { value: 'Market' } })
    answer(json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ amount: '12', category: 'c1', date: null, shop: null, flow: null }) }))
    await screen.findByRole('button', { name: 'Fill in' })

    expect([field('Amount').value, field('What was it?').value]).toEqual(['', 'Market'])
    expect(screen.queryByText('Read by AI: check it')).toBeNull()
  })

  it('still fills the form when Add was pressed early and saved nothing', async () => {
    const fake = seeded()
    const [gemini, ...rest] = fake.functions.aiStatus.services
    fake.functions.aiStatus = aiStatusReply({ services: [{ ...gemini!, source: 'secret', hint: 'abcd' }, ...rest] })
    let answer: (r: Response) => void = () => undefined
    fake.functions.ai = (body) =>
      body['action'] !== 'run' ? json(fake.functions.aiStatus) : new Promise<Response>((done) => (answer = done))
    renderScreen(<AddScreen />, fake)

    fireEvent.click(await screen.findByRole('tab', { name: /Type it/ }))
    fireEvent.change(await screen.findByLabelText('Just type it'), { target: { value: '3 coffees 12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fill in' }))
    await waitFor(() => expect(runs(fake).length).toBe(1))
    // Add on the empty form only says what is missing: nothing the owner
    // typed is there for the AI's answer to write over.
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText(/^Still needed:/)).toBeTruthy()
    answer(json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify({ amount: '12', category: 'c1', date: null, shop: null, flow: null }) }))
    await screen.findByRole('button', { name: 'Fill in' })

    expect([field('Amount').value, field('Category').value]).toEqual(['12.00', 'c-coffee'])
    expect(screen.getByText('Read by AI: check it')).toBeTruthy()
    expect(fake.rpcCalls).toEqual([])
  })

  it('says it could not read the line when reading throws, rather than leave the old hint', async () => {
    const fake = seeded()
    renderScreen(<AddScreen />, fake)
    const quick = await import('../src/add/quick-add.js')
    const thrown = vi.spyOn(quick, 'readQuickEntry').mockRejectedValueOnce(new Error('network'))
    await justType('coffee 4.50')
    expect(await screen.findByText('Filled in what the app could read; fill in the rest, then press Add.')).toBeTruthy()
    thrown.mockRestore()
  })
})
