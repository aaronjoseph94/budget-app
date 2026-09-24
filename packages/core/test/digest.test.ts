import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { factsDigest, type FactsDigestInput } from '../src/index.js'

/** Suite tests, worked by hand from F24–F28 and F44 (docs/formula-decisions.md). */

const d = isoDate
const spend = (postedOn: string, cents: number, categoryId: string) => ({ postedOn: d(postedOn), amountCents: -cents, categoryId })
const DINING = '3f2a9c1e-8b4d-4e6f-a1b2-c3d4e5f60718'
const GROCERIES = '9d8c7b6a-5f4e-4d3c-b2a1-0f9e8d7c6b5a'

/**
 * Thursday 24 September 2026, records from 1 August. By 24 Aug $300.00 on
 * Dining out and Groceries; by 24 Sep $150.00. The week of 21 Sep has $80.00
 * to Thursday, the week before $20.00.
 */
const base: FactsDigestInput = {
  asOf: d('2026-09-24'),
  historyStart: d('2026-08-01'),
  readFrom: d('2026-08-01'),
  categories: [
    { id: DINING, name: 'Dining out', kind: 'variable', sortOrder: 0 },
    { id: GROCERIES, name: 'Groceries', kind: 'variable', sortOrder: 1 },
  ],
  budgetHistory: [],
  planHistory: [],
  entries: [
    spend('2026-08-03', 10_000, DINING),
    spend('2026-08-20', 20_000, GROCERIES),
    spend('2026-09-02', 5_000, DINING),
    spend('2026-09-15', 2_000, DINING),
    spend('2026-09-22', 8_000, GROCERIES),
  ],
  latestStatementEnd: d('2026-09-07'),
  pendingCount: 3,
}

const kinds = (input: FactsDigestInput) => factsDigest(input).facts.map((f) => f.kind)

describe('factsDigest, version 1', () => {
  it('puts stale data first, rows waiting second, then this month and this week against the same days before', () => {
    const digest = factsDigest(base)
    expect(digest.version).toBe(1)
    expect(digest.facts.slice(0, 4).map((f) => f.key)).toEqual(['data:stale', 'review:waiting', 'summary:month', 'summary:week'])
  })

  it('says how long ago the latest statement ends, from 11 days', () => {
    // 7 Sep to 24 Sep is 17 days.
    expect(factsDigest(base).facts[0]).toMatchObject({
      kind: 'stale_data', subject: { type: 'data', id: null, label: 'Your statements' }, meaning: 'info', notable: true,
      figures: { through: { unit: 'date', value: '2026-09-07' }, days: { unit: 'count', value: 17 } },
      cause: 'stale_data:2026-09-07',
    })
    expect(kinds({ ...base, latestStatementEnd: d('2026-09-14') })).not.toContain('stale_data')
    expect(kinds({ ...base, latestStatementEnd: d('2026-09-13') })).toContain('stale_data')
    expect(kinds({ ...base, latestStatementEnd: null })).not.toContain('stale_data')
  })

  it('counts the rows waiting in Review, and says nothing of none or of a count it could not read', () => {
    expect(factsDigest(base).facts[1]).toMatchObject({
      kind: 'rows_waiting', notable: true, figures: { count: { unit: 'count', value: 3 } }, cause: 'rows_waiting:2026-09-24',
    })
    expect(kinds({ ...base, pendingCount: 0 })).not.toContain('rows_waiting')
    expect(kinds({ ...base, pendingCount: null })).not.toContain('rows_waiting')
  })

  it('sets this month so far against the same days last month, sized by the summary band', () => {
    // $150.00 against $300.00: $150.00 less. Band max($25.00, 15% of $300.00) = $45.00; two bands or more is big.
    expect(factsDigest(base).facts[2]).toEqual({
      key: 'summary:month', kind: 'month_so_far', subject: { type: 'month', id: '2026-09-01', label: 'This month' },
      direction: 'down', size: 'big', evidence: 'thin', meaning: 'good', notable: true,
      figures: {
        now: { unit: 'cents', value: 15_000 }, before: { unit: 'cents', value: 30_000 },
        change: { unit: 'change', value: -15_000, direction: 'less' },
        now_to: { unit: 'date', value: '2026-09-24' }, before_to: { unit: 'date', value: '2026-08-24' },
      },
      impact: 15_000, cause: 'month_so_far:2026-09-24',
    })
  })

  it('sets this week to today against last week to the same weekday', () => {
    // 21–24 Sep $80.00 against 14–17 Sep $20.00: $60.00 more; band $25.00, so big.
    expect(factsDigest(base).facts[3]).toMatchObject({
      key: 'summary:week', kind: 'week_so_far', subject: { type: 'week', id: '2026-09-21', label: 'This week' },
      direction: 'up', size: 'big', meaning: 'watch',
      figures: { now: { value: 8_000 }, before: { value: 2_000 }, change: { value: 6_000, direction: 'more' } },
    })
  })

  it('says nothing of a window that starts before the records (F24)', () => {
    // Records from 8 August: 1–24 Aug is outside them, 14–17 Sep inside.
    expect(kinds({ ...base, historyStart: d('2026-08-08') })).toEqual(['stale_data', 'rows_waiting', 'week_so_far'])
    expect(kinds({ ...base, historyStart: null, latestStatementEnd: null, pendingCount: 0 })).toEqual([])
  })

  it('calls a change under $1.00 the same, and neither good nor watch', () => {
    const flat = { ...base, entries: [spend('2026-08-03', 1_000, DINING), spend('2026-09-03', 1_099, DINING)] }
    expect(factsDigest(flat).facts.find((f) => f.key === 'summary:month')).toMatchObject({
      direction: 'same', size: 'slight', meaning: 'info', notable: false,
    })
  })

  it('gives the same keys for the same records, and never an id in a label', () => {
    const keys = factsDigest(base).facts.map((f) => f.key)
    expect(factsDigest({ ...base, entries: [...base.entries].reverse() }).facts.map((f) => f.key)).toEqual(keys)
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    for (const fact of factsDigest(base).facts) expect(fact.subject.label).not.toMatch(uuid)
  })
})
