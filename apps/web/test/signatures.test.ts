import { describe, expect, it } from 'vitest'
import { factsDigest, isoDate } from '@budget/core'
import { dayLine, modelPayload, rankCards, type Tone } from '@budget/savings-coach'
import { GOAL_PART, type Day } from '../src/coach/narration.js'
import { sign, sigsByLetter } from '../src/coach/signatures.js'

/**
 * Today's signatures, hashed with WebCrypto: the same when only a cent
 * moves, different when a claim or the tone does, and kept under each
 * part's letter, the goal line's under the main goal's. Dining out's rise
 * on 24 September, with two goals.
 */
function day(diningCents: number, tone: Tone = 'cheerleader'): Day {
  const d = isoDate
  const { facts } = factsDigest({
    asOf: d('2026-09-24'), historyStart: d('2026-06-01'), readFrom: d('2025-09-01'),
    categories: [{ id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 }],
    budgetHistory: [], planHistory: [],
    entries: [...['06', '07', '08'].map((m) => ({ postedOn: d(`2026-${m}-10`), amountCents: -30_000, categoryId: 'dining' })), { postedOn: d('2026-09-03'), amountCents: -diningCents, categoryId: 'dining' }],
    latestStatementEnd: d('2026-09-20'), pendingCount: 0, goals: [],
  })
  const line = dayLine({ facts, tone })!
  return {
    tone,
    line: { fact: facts.find((f) => f.key === line.factKey)!, text: line.text },
    cards: rankCards({ facts, dismissed: new Set() }).cards,
    goals: [{ id: 'g1', name: 'Flight training', main: true, hasHours: true }, { id: 'g2', name: 'Travel', main: false, hasHours: false }],
    quotes: [],
    shareShopNames: true,
  }
}
const payloadOf = (today: Day) => modelPayload({ tone: today.tone, line: today.line!.fact, cards: today.cards, goals: today.goals, quotes: [], shareShopNames: true })

describe('today’s signatures', () => {
  it('sign the whole brief and each part, as SHA-256 hex', async () => {
    const today = day(60_000)
    const signed = await sign(today, payloadOf(today))
    expect([...signed.parts.keys()]).toEqual(['summary:month', 'cat:dining:change', GOAL_PART])
    for (const sig of [signed.factsSig, ...signed.parts.values()]) expect(sig).toMatch(/^[0-9a-f]{64}$/)
  })

  it('stay the same when only a cent moves, and all change with the tone', async () => {
    const today = day(60_000)
    const signed = await sign(today, payloadOf(today))
    const nudged = day(60_001)
    expect(await sign(nudged, payloadOf(nudged))).toEqual(signed)
    const straight = day(60_000, 'straight')
    const other = await sign(straight, payloadOf(straight))
    expect(other.factsSig).not.toBe(signed.factsSig)
    for (const [part, sig] of other.parts) expect(signed.parts.get(part)).not.toBe(sig)
  })

  it('are kept under each part’s letter, the goal line’s under the main goal’s', async () => {
    const today = day(60_000)
    const payload = payloadOf(today)
    const signed = await sign(today, payload)
    expect(payload.keys).toEqual({ A: 'summary:month', B: 'cat:dining:change', C: 'goal:g1', D: 'goal:g2' })
    expect(sigsByLetter(payload, signed)).toEqual({ A: signed.parts.get('summary:month'), B: signed.parts.get('cat:dining:change'), C: signed.parts.get(GOAL_PART) })
  })
})
