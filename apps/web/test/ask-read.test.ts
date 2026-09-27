import { describe, expect, it } from 'vitest'
import type { AskBrief } from '@budget/schema'
import { readQuestion } from '../src/ask/read.js'
import type { Category } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

/** Ask's reading of a question, before any screen (plan A24). */
const CATEGORIES: readonly Category[] = [
  { id: 'c-coffee', name: 'Coffee', kind: 'variable', sort_order: 0, weekly_budget_cents: null },
  { id: 'c-moved', name: 'Card payment', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
  { id: 'c-dining', name: 'Dining out', kind: 'variable', sort_order: 1, weekly_budget_cents: null },
]
const TOPICS = [{ id: 'statements', title: 'Bring in a statement' }]
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** A helper that answers every question with `reply`, keeping each brief. */
function answering(reply: unknown): { fake: FakeSupabase; briefs: AskBrief[] } {
  const fake = createFakeSupabase()
  const briefs: AskBrief[] = []
  fake.functions.ai = (body) => {
    briefs.push(body['data'] as AskBrief)
    return json({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: typeof reply === 'string' ? reply : JSON.stringify(reply) })
  }
  return { fake, briefs }
}

const read = (fake: FakeSupabase, question: string, chip = false) => readQuestion(fake.client, { question, asOf: '2026-09-27', categories: CATEGORIES, topics: TOPICS, chip })
const PLAN = { intent: 'what_if_cut', categories: ['c2'], period: 'this_month', month: null, year: null, topic: null, amount: '$40' }

describe('readQuestion', () => {
  it('asks the AI with the question, today, the categories under aliases and the topics, and nothing else', async () => {
    const { fake, briefs } = answering(PLAN)
    const r = await read(fake, 'What if I cut dining out by $40?')
    expect(briefs).toEqual([
      {
        question: 'What if I cut dining out by $40?',
        today: '2026-09-27',
        categories: [
          { alias: 'c1', name: 'Coffee', list: 'variable' },
          { alias: 'c2', name: 'Dining out', list: 'variable' },
        ],
        topics: TOPICS,
      },
    ])
    expect(r).toEqual({
      read: { kind: 'intent', intent: 'what_if_cut', categoryIds: ['c-dining'], period: { kind: 'this_month' }, amountText: '40' },
      by: { by: 'ai' },
    })
  })

  it('keeps no amount the owner did not write', async () => {
    const { fake } = answering({ ...PLAN, amount: '400' })
    expect((await read(fake, 'What if I cut dining out by $40?')).read).toMatchObject({ amountText: null })
  })

  it('reads the question itself, and says why, when the AI helper is not installed', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    const r = await read(fake, 'How much did I spend on coffee last month?')
    expect(r.read).toEqual({ kind: 'intent', intent: 'spend_in', categoryIds: ['c-coffee'], period: { kind: 'last_month' }, amountText: null })
    expect(r.by).toMatchObject({ by: 'app', why: { state: 'not_deployed', help: 'updates' } })
  })

  it('reads it itself when the AI’s reply does not parse', async () => {
    const { fake } = answering('not json at all')
    expect((await read(fake, 'How much did I spend on coffee?')).by).toEqual({ by: 'app', why: 'unreadable' })
  })

  it('reads a suggested question itself, spending no call', async () => {
    const { fake, briefs } = answering(PLAN)
    expect(await read(fake, 'How do I bring in a statement?', true)).toEqual({ read: { kind: 'help', topic: 'statements' }, by: { by: 'app', why: 'chip' } })
    expect(briefs).toEqual([])
  })

  it('takes the AI’s cannot as its answer', async () => {
    const { fake } = answering({ intent: 'cannot' })
    expect(await read(fake, 'Tell me a joke')).toEqual({ read: { kind: 'cannot' }, by: { by: 'ai' } })
  })
})
