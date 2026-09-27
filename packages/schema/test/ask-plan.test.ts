import { describe, expect, it } from 'vitest'
import { parseAskPlan, type AskBrief } from '../src/index.js'

/**
 * Ask's reading of a question as a model writes it (plan A24; ADR 0005 §7):
 * a plan, never an answer. Each part counts only when the brief offered it,
 * and an amount only when it is one of the owner's own words.
 */
const BRIEF: AskBrief = {
  question: 'What if I cut dining out by $50 a month?',
  today: '2026-09-27',
  categories: [
    { alias: 'c1', name: 'Groceries', list: 'variable' },
    { alias: 'c2', name: 'Dining out', list: 'variable' },
  ],
  topics: [
    { id: 'forecast', title: 'How the forecast works' },
    { id: 'updates', title: 'One-time updates' },
  ],
}
const plan = (over: Record<string, unknown>) => ({ intent: 'spend_in', categories: [], period: null, month: null, year: null, topic: null, amount: null, ...over })

describe('parseAskPlan keeps what the brief offered', () => {
  it('reads an intent, its categories, a period and the owner’s amount, from text or an object', () => {
    const reply = plan({ intent: 'what_if_cut', categories: ['c2'], amount: '$50' })
    const kept = { ok: true, plan: { kind: 'intent', intent: 'what_if_cut', aliases: ['c2'], period: null, amountText: '50' }, dropped: 0 }
    expect(parseAskPlan(JSON.stringify(reply), BRIEF)).toEqual(kept)
    expect(parseAskPlan(reply, BRIEF)).toEqual(kept)
  })

  it('reads each period from its fixed set, and a month by its name this year or last', () => {
    expect(parseAskPlan(plan({ period: 'last_three_months' }), BRIEF)).toMatchObject({ plan: { period: { kind: 'last_three_months' } }, dropped: 0 })
    expect(parseAskPlan(plan({ period: 'month', month: 'August' }), BRIEF)).toMatchObject({ plan: { period: { kind: 'month', month: 'august', year: 'this' } }, dropped: 0 })
    expect(parseAskPlan(plan({ period: 'month', month: 'july', year: 'last' }), BRIEF)).toMatchObject({ plan: { period: { kind: 'month', month: 'july', year: 'last' } } })
  })

  it('opens a Help topic the brief offered', () => {
    expect(parseAskPlan(plan({ intent: 'help', topic: 'forecast' }), BRIEF)).toEqual({ ok: true, plan: { kind: 'help', topic: 'forecast' }, dropped: 0 })
  })

  it('takes cannot as cannot', () => {
    expect(parseAskPlan({ intent: 'cannot' }, BRIEF)).toEqual({ ok: true, plan: { kind: 'cannot' }, dropped: 0 })
  })
})

describe('parseAskPlan drops what the brief did not offer', () => {
  it('reads an intent it does not know, or a Help topic not offered, as cannot', () => {
    expect(parseAskPlan(plan({ intent: 'transfer_money' }), BRIEF)).toEqual({ ok: true, plan: { kind: 'cannot' }, dropped: 1 })
    expect(parseAskPlan(plan({ intent: 'help', topic: 'https://example.com' }), BRIEF)).toEqual({ ok: true, plan: { kind: 'cannot' }, dropped: 1 })
  })

  it('drops a category not offered, one named rather than aliased, a repeat and a fourth', () => {
    const many = { ...BRIEF, categories: ['c1', 'c2', 'c3', 'c4'].map((alias) => ({ alias, name: alias, list: 'variable' as const })) }
    expect(parseAskPlan(plan({ categories: ['c9', 'Groceries', 'c1'] }), BRIEF)).toMatchObject({ plan: { aliases: ['c1'] }, dropped: 2 })
    expect(parseAskPlan(plan({ categories: ['c1', 'c1', 'c2', 'c3', 'c4'] }), many)).toMatchObject({ plan: { aliases: ['c1', 'c2', 'c3'] }, dropped: 2 })
  })

  it('drops a period with a date in it, or outside the set', () => {
    for (const reply of [plan({ period: '2026-08' }), plan({ period: 'month', month: 'smarch' }), plan({ period: 'month', month: 'may', year: '2025' }), plan({ period: 'next_month' })]) {
      expect(parseAskPlan(reply, BRIEF)).toMatchObject({ plan: { period: null }, dropped: 1 })
    }
  })

  it('drops an amount the owner did not write, or wrote differently', () => {
    for (const amount of ['60', '50.00', '5', 'fifty']) {
      expect(parseAskPlan(plan({ intent: 'what_if_cut', amount }), BRIEF)).toMatchObject({ plan: { amountText: null }, dropped: 1 })
    }
  })

  it('refuses a reply that is not the shape at all', () => {
    for (const raw of ['not json', '[]', { categories: ['c1'] }, { intent: 7 }]) {
      expect(parseAskPlan(raw, BRIEF)).toEqual({ ok: false })
    }
  })
})
