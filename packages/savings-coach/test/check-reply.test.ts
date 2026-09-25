import { describe, expect, it } from 'vitest'
import type { NarrateReply } from '@budget/schema'
import { GOAL_LINE_TEMPLATES, LIBRARY, LINE_TEMPLATES, cardWords, checkReply, dayLine, modelPayload, rankCards } from '../src/index.js'
import { FACTS, factOf } from './fixtures.js'

/**
 * Rules 8 and 9 of ADR 0005 §4 on the daily pack: the words may name only
 * what was offered, where it was offered, and may not contradict a
 * change's direction. The fixture's day: the line speaks of this month;
 * the cards are stale data, rows in Review and Dining out's rise; the
 * goals are Flight training (main) and Emergency fund.
 */
const line = dayLine({ facts: FACTS, tone: 'cheerleader' })!
const cards = rankCards({ facts: FACTS, dismissed: new Set() }).cards
const { brief, keys } = modelPayload({
  tone: 'cheerleader',
  line: factOf(line.factKey),
  cards,
  goals: [
    { id: 'g1', name: 'Flight training', main: true, hasHours: true },
    { id: 'g2', name: 'Emergency fund', main: false, hasHours: false },
  ],
  quotes: LIBRARY.slice(0, 6),
})
const letter = (key: string) => Object.entries(keys).find(([, k]) => k === key)![0]
const DINING = letter('cat:dining:change')
const STALE = letter('data:stale')

const GOOD: NarrateReply = {
  summary: 'You’ve spent {{A.change}} than by this day last month. Still time to ease off.',
  cards: [
    { fact: DINING, title: 'Running ahead: {{' + DINING + '.name}}', body: 'You’ve spent {{' + DINING + '.change}} on it than last month.', tryThis: 'One thing to try: cook at home a few nights.' },
    { fact: STALE, title: 'Time for a fresh statement', body: 'Your last one ends on {{' + STALE + '.through}}.', tryThis: null },
  ],
  goal: 'Every lighter week brings {{E.name}} closer, and {{F.name}} too.',
  quote: { id: LIBRARY[0]!.id, why: 'Little charges add up.' },
}

const card = (over: Partial<NarrateReply['cards'][number]>) => ({ ...GOOD, cards: [{ ...GOOD.cards[0]!, ...over }, GOOD.cards[1]!] })

describe('checkReply', () => {
  it('keeps a reply that names only what it was offered', () => {
    expect(brief.facts.find((f) => f.id === DINING)?.direction).toBe('up')
    expect(checkReply({ reply: GOOD, brief })).toEqual({ reply: GOOD, dropped: [] })
  })

  it('drops "fell" beside a rise, "rose" beside a fall, and a direction said twice', () => {
    const fell = checkReply({ reply: card({ body: 'Dining fell: {{' + DINING + '.change}} on it.' }), brief })
    expect(fell.dropped).toEqual([{ part: 'card', reason: 'direction' }])
    expect(fell.reply.cards.map((c) => c.fact)).toEqual([STALE])
    // This month's summary went up; "less" beside it contradicts the figure.
    expect(checkReply({ reply: { ...GOOD, summary: 'You spent {{A.change}}, so less than before.' }, brief }).dropped).toEqual([{ part: 'summary', reason: 'direction' }])
    const down = { ...brief, facts: brief.facts.map((f) => (f.id === DINING ? { ...f, direction: 'down' as const } : f)) }
    expect(checkReply({ reply: card({ body: 'It rose: {{' + DINING + '.change}}.' }), brief: down }).dropped).toEqual([{ part: 'card', reason: 'direction' }])
    expect(checkReply({ reply: card({ body: 'You spent {{' + DINING + '.change}} more on it.' }), brief }).dropped).toEqual([{ part: 'card', reason: 'direction' }])
    // A rising word in another sentence of the same card says nothing about the figure.
    expect(checkReply({ reply: card({ body: 'You spent {{' + DINING + '.change}} on it. Cook more at home.' }), brief }).dropped).toEqual([])
  })

  it('refuses a card not offered as a card, or worded twice', () => {
    const summary = { ...GOOD.cards[1]!, fact: 'A' }
    expect(checkReply({ reply: { ...GOOD, cards: [summary, ...GOOD.cards] }, brief }).dropped).toEqual([{ part: 'card', reason: 'not_offered' }])
    expect(checkReply({ reply: { ...GOOD, cards: [...GOOD.cards, GOOD.cards[1]!] }, brief }).dropped).toEqual([{ part: 'card', reason: 'twice' }])
    expect(checkReply({ reply: card({ fact: 'Q' }), brief }).dropped).toEqual([{ part: 'card', reason: 'not_offered' }])
  })

  it('lets each part name only its own blanks', () => {
    expect(checkReply({ reply: card({ body: 'Up {{' + STALE + '.days}} days.' }), brief }).dropped).toEqual([{ part: 'card', reason: 'unknown_fact' }])
    expect(checkReply({ reply: card({ body: 'You spent {{Q.change}} on it.' }), brief }).dropped).toEqual([{ part: 'card', reason: 'unknown_fact' }])
    expect(checkReply({ reply: card({ body: 'You spent {{' + DINING + '.balance}}.' }), brief }).dropped).toEqual([{ part: 'card', reason: 'unknown_slot' }])
    expect(checkReply({ reply: { ...GOOD, summary: 'Dining: {{' + DINING + '.change}}.' }, brief }).reply.summary).toBeNull()
    expect(checkReply({ reply: { ...GOOD, goal: 'Keep {{A.name}} going.' }, brief }).dropped).toEqual([{ part: 'goal', reason: 'unknown_fact' }])
    expect(checkReply({ reply: { ...GOOD, goal: 'Closer by {{E.change}}.' }, brief }).dropped).toEqual([{ part: 'goal', reason: 'unknown_slot' }])
  })

  it('drops a card to watch that has lost its one thing to try, and keeps one that never needed it', () => {
    const out = checkReply({ reply: card({ tryThis: 'Try {{Q.name}}.' }), brief })
    expect(out.dropped).toEqual([{ part: 'tryThis', reason: 'unknown_fact' }, { part: 'card', reason: 'no_try' }])
    expect(checkReply({ reply: card({ tryThis: null }), brief }).dropped).toEqual([{ part: 'card', reason: 'no_try' }])
    expect(checkReply({ reply: GOOD, brief }).reply.cards[1]?.tryThis).toBeNull()
  })

  it('takes a quote only from the shortlist, whose why names nothing', () => {
    const other = LIBRARY.find((e) => !brief.quotes.some((q) => q.id === e.id))!
    expect(checkReply({ reply: { ...GOOD, quote: { id: other.id, why: null } }, brief })).toEqual({
      reply: { ...GOOD, quote: null },
      dropped: [{ part: 'quote', reason: 'not_offered' }],
    })
    expect(checkReply({ reply: { ...GOOD, quote: { id: LIBRARY[0]!.id, why: 'As {{A.name}} shows.' } }, brief }).reply.quote).toEqual({ id: LIBRARY[0]!.id, why: null })
  })

  it('drops a line or a goal line the brief did not ask for', () => {
    const bare = { ...brief, summary: null, goals: [] }
    expect(checkReply({ reply: GOOD, brief: bare }).dropped).toEqual([
      { part: 'summary', reason: 'not_offered' },
      { part: 'goal', reason: 'not_offered' },
    ])
  })

  it('passes the app’s own words, which the Coach shows when the AI’s fail', () => {
    const own: NarrateReply = {
      summary: line.text,
      cards: cards.map((c, i) => {
        const id = brief.cards[i]!
        const words = cardWords(c.template, 'cheerleader')
        const as = (t: string) => t.replaceAll('{{A.', `{{${id}.`)
        return { fact: id, title: as(words.title), body: as(words.body), tryThis: words.tryThis === null ? null : as(words.tryThis) }
      }),
      goal: GOAL_LINE_TEMPLATES.cheerleader.replace('{{A.', '{{E.'),
      quote: null,
    }
    expect(Object.keys(LINE_TEMPLATES)).toContain('month_watch')
    expect(checkReply({ reply: own, brief }).dropped).toEqual([])
  })
})
