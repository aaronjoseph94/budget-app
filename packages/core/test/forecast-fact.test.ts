import { describe, expect, it } from 'vitest'
import { factsDigest, forecastFact } from '../src/index.js'
import { d, example, on } from './forecast-example.js'

/** Suite tests: the forecast's facts for the Coach's words (plan A13), from F30 to F32's running example. */

describe('forecastFact', () => {
  it('names the month’s end, safe to spend and the tightest day as blanks, never a card of its own', () => {
    expect(forecastFact(example)).toEqual({
      key: 'forecast:month',
      kind: 'month_forecast',
      subject: { type: 'month', id: '2026-09-01', label: 'This month' },
      direction: 'none',
      size: null,
      evidence: 'some',
      meaning: 'info',
      notable: false,
      figures: {
        month: { unit: 'month', value: '2026-09-01' },
        spent: { unit: 'dollars', value: 239_000 },
        end: { unit: 'dollars', value: 331_000 },
        low: { unit: 'dollars', value: 328_000 },
        high: { unit: 'dollars', value: 334_000 },
        safe_day: { unit: 'cents', value: 50_285 },
        days: { unit: 'count', value: 7 },
        tightest_day: { unit: 'date', value: '2026-10-08' },
        tightest: { unit: 'cents', value: 203_252 },
      },
      impact: 0,
      cause: 'month_forecast:2026-09-01',
    })
  })

  it('speaks of the projected Spent alone without a typed start (D17)', () => {
    expect(forecastFact({ ...example, startingBalanceCents: null })?.figures).toEqual({
      month: { unit: 'month', value: '2026-09-01' },
      spent: { unit: 'dollars', value: 239_000 },
    })
  })

  it('asks to watch when the month would end below $0 or run out on a day', () => {
    // A start of −1,000.00: the lowest end is 3,280.00 − 3,000.00 = 280.00, and
    // the tightest day 2,032.52 − 3,000.00, below $0.
    expect(forecastFact({ ...example, startingBalanceCents: -100_000 })?.meaning).toBe('watch')
    expect(forecastFact({ ...example, startingBalanceCents: -400_000 })?.meaning).toBe('watch')
  })

  it('says nothing when it is too early to', () => {
    expect(forecastFact(on('2026-09-05', { historyStart: d('2026-08-08') }))).toBeNull()
  })

  it('joins the digest only when its inputs are given, apart from the ranked facts', () => {
    const shared = { ...example, latestStatementEnd: null, pendingCount: 0, goals: [] }
    const { paySchedules, startingBalanceCents } = example
    expect(factsDigest(shared).forecast).toBeNull()
    const digest = factsDigest({ ...shared, forecast: { paySchedules, startingBalanceCents } })
    expect(digest.forecast?.key).toBe('forecast:month')
    expect(digest.facts.some((f) => f.kind === 'month_forecast')).toBe(false)
  })
})
