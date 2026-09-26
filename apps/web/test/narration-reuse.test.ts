import { describe, expect, it } from 'vitest'
import { factsDigest, isoDate } from '@budget/core'
import { LIBRARY, checkReply, dayLine, modelPayload, rankCards, type Card } from '@budget/savings-coach'
import type { NarrateReply } from '@budget/schema'
import type { Note } from '../src/coach/ai-cache.js'
import { GOAL_PART, fromReply, ownWords, reuse, type Day, type Signed } from '../src/coach/narration.js'

/**
 * Which words each part of the day gets (ADR 0005 §6): the app's own
 * first, the AI's over them part by part while their signatures match,
 * and every figure from today's facts. Thursday 24 September 2026: the
 * month is $300.00 up on 1–24 Aug; the cards are stale data, two rows in
 * Review, and Dining out's rise.
 */
const d = isoDate
const spend = (on: string, cents: number, categoryId: string) => ({ postedOn: d(on), amountCents: -cents, categoryId })

function dayWith(diningSept: number): Day {
  const { facts } = factsDigest({
    asOf: d('2026-09-24'), historyStart: d('2026-06-01'), readFrom: d('2025-09-01'),
    categories: [{ id: 'dining', name: 'Dining out', kind: 'variable', sortOrder: 0 }, { id: 'groceries', name: 'Groceries', kind: 'variable', sortOrder: 1 }],
    budgetHistory: [], planHistory: [],
    entries: [
      ...['06', '07', '08'].flatMap((m) => [spend(`2026-${m}-10`, 30_000, 'dining'), spend(`2026-${m}-12`, 40_000, 'groceries')]),
      spend('2026-09-03', diningSept, 'dining'), spend('2026-09-12', 40_000, 'groceries'),
    ],
    latestStatementEnd: d('2026-09-07'), pendingCount: 2, goals: [],
  })
  const line = dayLine({ facts, tone: 'cheerleader' })!
  return {
    tone: 'cheerleader',
    line: { fact: facts.find((f) => f.key === line.factKey)!, text: line.text },
    cards: rankCards({ facts, dismissed: new Set() }).cards,
    goals: [{ id: 'g1', name: 'Flight training', main: true, hasHours: true }, { id: 'g2', name: 'Emergency fund', main: false, hasHours: false }],
    quotes: LIBRARY.slice(0, 6),
    shareShopNames: true,
  }
}

const DAY = dayWith(60_000)
const payload = modelPayload({ tone: DAY.tone, line: DAY.line!.fact, cards: DAY.cards, goals: DAY.goals, quotes: DAY.quotes, shareShopNames: true })
const letter = (key: string) => Object.entries(payload.keys).find(([, k]) => k === key)![0]
const L = { line: letter('summary:month'), stale: letter('data:stale'), review: letter('review:waiting'), dining: letter('cat:dining:change'), flight: letter('goal:g1') }

const REPLY: NarrateReply = {
  summary: `Easy does it: {{${L.line}.change}} than by this day last month.`,
  cards: [
    { fact: L.stale, title: 'Fresh statement, fresh advice', body: `Yours ends on {{${L.stale}.through}}.`, tryThis: null },
    { fact: L.review, title: 'A few charges to file', body: `In Review: {{${L.review}.count}}.`, tryThis: null },
    { fact: L.dining, title: `{{${L.dining}.name}} is running hot`, body: `You spent {{${L.dining}.change}} on it than last month.`, tryThis: 'One thing to try: cook at home a few nights.' },
  ],
  goal: `Every lighter week brings {{${L.flight}.name}} closer.`,
  quote: { id: LIBRARY[0]!.id, why: 'Little charges add up.' },
}

const PARTS = [['summary:month', 'sig-line'], ['data:stale', 'sig-stale'], ['review:waiting', 'sig-review'], ['cat:dining:change', 'sig-dining'], [GOAL_PART, 'sig-goals']] as const
const SIGNED: Signed = { factsSig: 'sig-whole', parts: new Map(PARTS) }
const note = (over: Partial<Note> = {}): Note => ({
  scope: 'day:2026-09-24', factsSig: 'sig-whole', body: REPLY, provider: 'gemini', factKeys: payload.keys,
  cardSigs: { [L.line]: 'sig-line', [L.stale]: 'sig-stale', [L.review]: 'sig-review', [L.dining]: 'sig-dining', [L.flight]: 'sig-goals' },
  ...over,
})
const texts = (day: Day, n: ReturnType<typeof ownWords>) => [n.line?.text, ...day.cards.map((c: Card) => n.cards.get(c.fact.key)?.title.text), n.goal?.text]

describe('the app’s own words', () => {
  it('fill every part first, in the owner’s tone, none of them marked as the AI’s', () => {
    const own = ownWords(DAY)
    expect(texts(DAY, own)).toEqual([DAY.line!.text, 'Time for a fresh statement', 'Charges waiting for you', 'Running ahead: {{A.name}}', 'Every lighter week brings {{A.name}} closer. Keep going!'])
    expect([own.line?.ai, own.goal?.ai, own.quote]).toEqual([false, false, null])
    expect(own.goal?.names['A']?.subject.label).toBe('Flight training')
  })
})

describe('a fresh reply', () => {
  it('replaces each part it words, and a hostile card drops only itself', () => {
    const hostile: NarrateReply = { ...REPLY, cards: REPLY.cards.map((c) => (c.fact === L.review ? { ...c, body: `It fell: {{${L.dining}.change}}.` } : c)) }
    const checked = checkReply({ reply: hostile, brief: payload.brief })
    const n = fromReply(DAY, payload, checked.reply)
    expect(texts(DAY, n)).toEqual([REPLY.summary, 'Fresh statement, fresh advice', 'Charges waiting for you', `{{${L.dining}.name}} is running hot`, REPLY.goal])
    expect(n.cards.get('review:waiting')?.body.ai).toBe(false)
    expect(n.quote).toEqual({ id: LIBRARY[0]!.id, why: { text: 'Little charges add up.', names: {}, ai: true } })
  })
})

describe('kept words', () => {
  it('are used whole when today’s brief is the one they were written for', () => {
    const kept = reuse(DAY, SIGNED, [note()])
    expect([kept.whole, kept.uncovered, kept.total, kept.provider]).toEqual([true, 0, 4, 'gemini'])
    expect(kept.narration.line?.text).toBe(REPLY.summary)
  })

  it('draw today’s figures, not the ones they were written beside', () => {
    // Dining out moved a dollar: the same claims, so the same signatures, and the words are reused.
    const today = dayWith(60_100)
    const kept = reuse(today, SIGNED, [note()])
    const dining = kept.narration.cards.get('cat:dining:change')!
    expect(dining.body.text).toBe(REPLY.cards[2]!.body)
    const live = today.cards.find((c) => c.fact.key === 'cat:dining:change')!.fact
    expect(dining.body.names[L.dining]).toBe(live)
    expect(live.figures['change']).not.toEqual(DAY.cards.find((c) => c.fact.key === 'cat:dining:change')!.fact.figures['change'])
  })

  it('are reused a card at a time, under that note’s own letters', () => {
    // An older pack worded Dining out as its card Q; today only its signature still matches.
    const older = note({
      factsSig: 'sig-older', cardSigs: { Q: 'sig-dining', A: 'sig-line-older' }, factKeys: { Q: 'cat:dining:change', A: 'summary:month' },
      body: { ...REPLY, summary: 'Old words: {{A.change}}.', cards: [{ ...REPLY.cards[2]!, fact: 'Q', title: '{{Q.name}} again', body: 'Up: {{Q.change}}.' }], goal: null, quote: null },
    })
    const kept = reuse(DAY, SIGNED, [older])
    expect(texts(DAY, kept.narration)).toEqual([DAY.line!.text, 'Time for a fresh statement', 'Charges waiting for you', '{{Q.name}} again', 'Every lighter week brings {{A.name}} closer. Keep going!'])
    expect(kept.narration.cards.get('cat:dining:change')?.title.names['Q']).toBe(DAY.cards[2]!.fact)
    expect([kept.whole, kept.uncovered, kept.total]).toEqual([false, 3, 4])
  })

  it('are never used once a signature has changed', () => {
    const kept = reuse(DAY, { factsSig: 'sig-new', parts: new Map([...SIGNED.parts].map(([k, v]) => [k, `${v}-changed`])) }, [note()])
    expect(texts(DAY, kept.narration)).toEqual(texts(DAY, ownWords(DAY)))
    expect([kept.whole, kept.uncovered, kept.provider]).toEqual([false, 4, null])
  })

  it('leave a part in the app’s words when a letter they name is gone, or a card to watch has lost its thing to try', () => {
    const gone = note({ factKeys: { ...payload.keys, [L.flight]: 'goal:gone' } })
    expect(reuse(DAY, SIGNED, [gone]).narration.goal?.ai).toBe(false)
    const bare = note({ body: { ...REPLY, cards: REPLY.cards.map((c) => ({ ...c, tryThis: null })) } })
    expect(reuse(DAY, SIGNED, [bare]).narration.cards.get('cat:dining:change')?.title.ai).toBe(false)
  })
})
