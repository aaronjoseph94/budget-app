import { describe, expect, it } from 'vitest'
import type { AskIntentName, AskPlan } from '@budget/schema'
import { ASK_CATALOGUE, matchQuestion, queryOf, readOf, type AskRead } from '../src/index.js'

/**
 * Ask's intents and the app's own reading of a question (plan A24), for when
 * the AI does not read it. Sunday 27 September 2026; categories and topics
 * as the app offers them.
 */
const CATEGORIES = [
  { id: 'c-dining', name: 'Dining out' },
  { id: 'c-groceries', name: 'Groceries' },
  { id: 'c-coffee', name: 'Coffee' },
]
const TOPICS = [
  { id: 'statements', title: 'Bring in a statement' },
  { id: 'budgets', title: 'Budgets and bills' },
  { id: 'free-ai', title: 'Turn on free AI' },
]
const match = (question: string) => matchQuestion({ question, today: '2026-09-27', categories: CATEGORIES, topics: TOPICS })
const intent = (read: AskRead) => (read.kind === 'intent' ? read.intent : read.kind)

describe('the intent catalogue', () => {
  it('suggests a question for every intent, which the app reads as that intent with no AI', () => {
    for (const [name, entry] of Object.entries(ASK_CATALOGUE) as [AskIntentName, (typeof ASK_CATALOGUE)[AskIntentName]][]) {
      expect([name, intent(match(entry.example))]).toEqual([name, name])
    }
  })
})

describe('matchQuestion', () => {
  it('reads a category, a period and an amount out of the question', () => {
    expect(match('How much did I spend on coffee in August?')).toEqual({
      kind: 'intent',
      intent: 'spend_in',
      categoryIds: ['c-coffee'],
      period: { kind: 'month', month: 'august', year: 'this' },
      amountText: null,
    })
    expect(match('What if I cut dining out by $50 a month?')).toMatchObject({ intent: 'what_if_cut', categoryIds: ['c-dining'], amountText: '50' })
    expect(match('what if i saved 1,200.50')).toMatchObject({ amountText: '1,200.50' })
  })

  it('reads several categories in the order asked, and a plural or singular name', () => {
    expect(match('groceries vs dining out this month')).toMatchObject({ intent: 'compare', categoryIds: ['c-groceries', 'c-dining'], period: { kind: 'this_month' } })
    expect(match('How much on grocery last week')).toMatchObject({ categoryIds: ['c-groceries'], period: { kind: 'last_week' } })
  })

  it('reads a month named alone as the latest one, and "last" before it as last year', () => {
    expect(match('spending in December')).toMatchObject({ period: { kind: 'month', month: 'december', year: 'last' } })
    expect(match('spending last august')).toMatchObject({ period: { kind: 'month', month: 'august', year: 'last' } })
    expect(match('spending in sept')).toMatchObject({ period: { kind: 'month', month: 'september', year: 'this' } })
    expect(match('spent over the past 3 months')).toMatchObject({ period: { kind: 'last_three_months' } })
    // "May" is a month after a word that names a time, never the verb.
    expect(match('How much may I spend on coffee?')).toMatchObject({ intent: 'spend_in', period: null })
    expect(match('coffee spending in may')).toMatchObject({ period: { kind: 'month', month: 'may', year: 'this' } })
    expect(match('spending last may')).toMatchObject({ period: { kind: 'month', month: 'may', year: 'last' } })
  })

  it('opens Help for a how-to question, by the topic sharing the most words', () => {
    expect(match('How do I set a budget?')).toEqual({ kind: 'help', topic: 'budgets' })
    expect(match('turn on the free AI')).toEqual({ kind: 'help', topic: 'free-ai' })
    // "How much" is about money, even when it starts like a how-to.
    expect(match('How much is left in my budget?')).toMatchObject({ intent: 'budget_left' })
  })

  it('cannot read what names no intent and no topic', () => {
    expect(match('Tell me a joke')).toEqual({ kind: 'cannot' })
    expect(match('   ')).toEqual({ kind: 'cannot' })
  })
})

describe('readOf and queryOf', () => {
  it('turns the AI’s aliases back into categories, leaving out any not offered', () => {
    const plan: AskPlan = { kind: 'intent', intent: 'spend_in', aliases: ['c2', 'c9'], period: { kind: 'last_month' }, amountText: null }
    expect(readOf(plan, new Map([['c2', 'c-coffee']]))).toEqual({ kind: 'intent', intent: 'spend_in', categoryIds: ['c-coffee'], period: { kind: 'last_month' }, amountText: null })
    expect(readOf({ kind: 'help', topic: 'budgets' }, new Map())).toEqual({ kind: 'help', topic: 'budgets' })
  })

  it('gives core a month by its number, and an amount only to a what-if', () => {
    const read = { kind: 'intent', intent: 'what_if_cut', categoryIds: ['c-dining'], period: { kind: 'month', month: 'december', year: 'last' }, amountText: '50' } as const
    expect(queryOf(read, 5_000)).toEqual({ intent: 'what_if_cut', period: { kind: 'month', month: 12, yearsBack: 1 }, categoryIds: ['c-dining'], monthlyCents: 5_000 })
    expect(queryOf({ ...read, intent: 'spend_in', period: null }, 5_000)).toEqual({ intent: 'spend_in', period: null, categoryIds: ['c-dining'], monthlyCents: null })
  })
})
