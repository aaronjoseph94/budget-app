import { describe, expect, it } from 'vitest'
import { limitsOf, nextPacificMidnight, restUntil, tokensOf } from '../ai/index.js'

/**
 * Staying inside the free limits (plan §3.5): the soft limits, the token
 * estimate, and how long a service rests after each kind of answer. Times
 * are worked by hand from the Pacific clock.
 */

const at = (iso: string) => Date.parse(iso)

describe('the soft limits', () => {
  it('keeps each free service below what it reports, and a paid one to the owner’s total alone', () => {
    expect(limitsOf('gemini', 'gemini-3.5-flash-lite')).toEqual({ calls: 200, tokens: null, perRequest: null })
    expect(limitsOf('gemini', 'gemini-3.5-flash')).toEqual({ calls: 15, tokens: null, perRequest: null })
    expect(limitsOf('groq', 'openai/gpt-oss-20b')).toEqual({ calls: 300, tokens: 150_000, perRequest: 6_000 })
    expect(limitsOf('openrouter', 'openrouter/free')).toEqual({ calls: 40, tokens: null, perRequest: null })
    for (const paid of ['openai', 'anthropic'] as const) expect(limitsOf(paid, '')).toEqual({ calls: null, tokens: null, perRequest: null })
  })

  it('estimates tokens as UTF-8 bytes over three, rounded up', () => {
    expect([tokensOf(''), tokensOf('abc'), tokensOf('abcd'), tokensOf('é'), tokensOf('€€')]).toEqual([0, 1, 2, 1, 2])
  })
})

describe('midnight Pacific', () => {
  it('is 07:00 UTC in summer time and 08:00 UTC in winter', () => {
    expect(nextPacificMidnight(at('2026-09-25T10:00:00.250Z'))).toBe(at('2026-09-26T07:00:00Z'))
    // 23:59 Pacific on the 24th is still the 24th there.
    expect(nextPacificMidnight(at('2026-09-25T06:59:00Z'))).toBe(at('2026-09-25T07:00:00Z'))
    expect(nextPacificMidnight(at('2026-12-31T20:00:00Z'))).toBe(at('2027-01-01T08:00:00Z'))
  })

  it('crosses a change of the clocks, which happens at 2 a.m.', () => {
    // Saturday 31 October 2026, 22:00 PDT; clocks go back at 02:00 on 1 November.
    expect(nextPacificMidnight(at('2026-11-01T05:00:00Z'))).toBe(at('2026-11-01T07:00:00Z'))
    // Sunday 1 November, 03:00 PST: the next midnight is in winter time.
    expect(nextPacificMidnight(at('2026-11-01T11:00:00Z'))).toBe(at('2026-11-02T08:00:00Z'))
  })
})

describe('how long a service rests', () => {
  const NOW = at('2026-09-25T17:00:00Z')
  const headers = (h: Record<string, string>) => new Headers(h)
  const quota = (quotaId: string, extra: unknown[] = []) => ({
    error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] }, ...extra] },
  })

  it('rests a busy service for its Retry-After, in seconds or as a date', () => {
    expect(restUntil('groq', 'rate_limited', headers({ 'retry-after': '7' }), {}, NOW)).toBe(NOW + 7_000)
    expect(restUntil('openai', 'rate_limited', headers({ 'retry-after': 'Fri, 25 Sep 2026 17:05:00 GMT' }), {}, NOW)).toBe(at('2026-09-25T17:05:00Z'))
  })

  it('rests it a minute when it does not say, and for Google’s own delay when Google does', () => {
    expect(restUntil('openrouter', 'rate_limited', headers({}), {}, NOW)).toBe(NOW + 60_000)
    expect(restUntil('anthropic', 'rate_limited', null, {}, NOW)).toBe(NOW + 60_000)
    expect(restUntil('groq', 'rate_limited', headers({ 'retry-after': 'soon' }), {}, NOW)).toBe(NOW + 60_000)
    const retry = { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '33.5s' }
    expect(restUntil('gemini', 'rate_limited', headers({}), quota('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', [retry]), NOW)).toBe(NOW + 33_500)
  })

  it('rests Gemini until midnight Pacific when its free daily quota is spent', () => {
    const body = quota('GenerateRequestsPerDayPerProjectPerModel-FreeTier')
    expect(restUntil('gemini', 'rate_limited', headers({ 'retry-after': '30' }), body, NOW)).toBe(at('2026-09-26T07:00:00Z'))
  })

  it('rests a model the service no longer offers for 25 hours, and nothing else at all', () => {
    expect(restUntil('anthropic', 'model_not_found', null, {}, NOW)).toBe(NOW + 25 * 3_600_000)
    for (const outcome of ['ok', 'rejected', 'provider_error', 'timeout', 'unreachable'] as const) {
      expect([outcome, restUntil('gemini', outcome, headers({ 'retry-after': '9' }), {}, NOW)]).toEqual([outcome, null])
    }
  })
})
