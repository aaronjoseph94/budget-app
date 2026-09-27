import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/core'
import { readAnswers, saveAnswer } from '../src/coach/answers.js'
import { checkinFigures } from '../src/coach/checkin.js'
import type { DigestRows } from '../src/coach/facts.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/** The check-in's answers (0017's coach_answers) and its figures from core (F42), Sunday 27 September 2026. */

const cat = (id: string, name: string, kind: Category['kind'], weekly: number | null): Category =>
  ({ id, name, kind, sort_order: 0, weekly_budget_cents: weekly }) as Category
const CATEGORIES = [cat('dining', 'Dining out', 'variable', 7_000), cat('coffee', 'Coffee', 'variable', null)]
const row = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({ id, posted_on, amount_cents, merchant_raw: id.toUpperCase(), category_id, source: 'statement' })
const READ: DigestRows = {
  asOf: '2026-09-27',
  readFrom: '2025-09-01',
  rows: [row('sushi', '2026-09-23', -8_420, 'dining'), row('burger', '2026-09-26', -2_000, 'dining'), row('cafe', '2026-09-25', -1_999, 'coffee')],
  budgets: [],
  plans: [],
  statementEnds: [],
  records: { statementStarts: ['2026-02-01'], entryDates: [] },
  pending: null,
}

describe('checkinFigures', () => {
  it('hands the year’s rows to core, each question naming its transaction', () => {
    const figures = checkinFigures(READ, CATEGORIES, [], [])
    expect(figures.recap).toMatchObject({ status: 'ready', spentCents: 12_419, top: { categoryId: 'dining', spentCents: 10_420 } })
    expect(figures.questions.map((q) => q.transactionId)).toEqual(['sushi', 'burger'])
    // No complete month has Dining out, so the usual month is $0: at least $5.00.
    expect(figures.limit).toMatchObject({ categoryId: 'dining', limitCents: 500 })
    expect(figures.impulse.shareBp).toBeNull()
  })

  it('leaves out a charge answered when the check-in opened, and counts every answer kept', () => {
    const answers = [{ transactionId: 'sushi', answer: 'impulse' as const, askedWeek: isoDate('2026-09-21') }]
    const figures = checkinFigures(READ, CATEGORIES, ['sushi'], answers)
    expect(figures.questions.map((q) => q.transactionId)).toEqual(['burger'])
    expect(figures.impulse).toMatchObject({ answers: 1, impulse: 1, shareBp: 10_000 })
  })
})

describe('the answers', () => {
  it('are kept one per charge, a second tap changing it, and read back', async () => {
    const fake = createFakeSupabase()
    expect(await saveAnswer(fake.client, 'u1', { transactionId: 'sushi', answer: 'planned', askedWeek: isoDate('2026-09-21') })).toBe(true)
    expect(await saveAnswer(fake.client, 'u1', { transactionId: 'sushi', answer: 'impulse', askedWeek: isoDate('2026-09-21') })).toBe(true)
    expect(fake.tables.coach_answers).toEqual([expect.objectContaining({ user_id: 'u1', transaction_id: 'sushi', answer: 'impulse', asked_week: '2026-09-21' })])
    expect(await readAnswers(fake.client)).toEqual({ status: 'ready', rows: [{ transactionId: 'sushi', answer: 'impulse', askedWeek: '2026-09-21' }] })
  })

  it('say a one-time update is missing when 0017 is not in, and failed otherwise', async () => {
    const fake = createFakeSupabase()
    fake.fail('coach_answers', '42P01')
    expect(await readAnswers(fake.client)).toEqual({ status: 'missing' })
    expect(await saveAnswer(fake.client, 'u1', { transactionId: 'sushi', answer: 'planned', askedWeek: isoDate('2026-09-21') })).toBe(false)
    fake.fail('coach_answers', 'PGRST205')
    expect(await readAnswers(fake.client)).toEqual({ status: 'missing' })
    fake.fail('coach_answers', '57014')
    expect(await readAnswers(fake.client)).toEqual({ status: 'failed' })
  })
})
