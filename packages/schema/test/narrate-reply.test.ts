import { describe, expect, it } from 'vitest'
import { parseNarrateReply, type NarrateReply } from '../src/narrate.js'

/**
 * The daily pack's reply, as a model writes it (plan A12): the outer shape
 * decides whether anything is kept, and then each string is held to the
 * text rule alone, so one bad sentence drops only its own part.
 */
const GOOD = {
  summary: 'You’ve spent {{A.change}} than by this day last month. Nice going!',
  cards: [
    { fact: 'B', title: 'Running ahead: {{B.name}}', body: 'You’ve spent {{B.change}} on it.', tryThis: 'One thing to try: cook at home a few nights.' },
    { fact: 'C', title: 'Nice work on {{C.name}}', body: 'Down on last month, and money stays put.', tryThis: null },
  ],
  goal: 'Every lighter week brings {{E.name}} closer.',
  quote: { id: 'franklin-small-leak', why: 'Little charges add up, as he said.' },
}

const withCard = (over: Partial<(typeof GOOD.cards)[number]>) => ({ ...GOOD, cards: [{ ...GOOD.cards[0]!, ...over }, GOOD.cards[1]!] })

describe('parseNarrateReply', () => {
  it('keeps a reply that follows every rule, from its text or as stored', () => {
    const want: NarrateReply = GOOD
    expect(parseNarrateReply(JSON.stringify(GOOD))).toEqual({ ok: true, reply: want, dropped: [] })
    expect(parseNarrateReply(GOOD)).toEqual({ ok: true, reply: want, dropped: [] })
  })

  it('drops a reply whose shape is wrong, whole', () => {
    for (const bad of ['Sure! Here you go.', '[]', 'null', JSON.stringify({ ...GOOD, cards: 'none' }), JSON.stringify({ ...GOOD, summary: undefined })]) {
      expect(parseNarrateReply(bad), bad).toEqual({ ok: false })
    }
    // A card may name its fact only by a letter, and a quote only by an id with no digit.
    expect(parseNarrateReply(withCard({ fact: 'b1' }))).toEqual({ ok: false })
    expect(parseNarrateReply({ ...GOOD, quote: { id: 'franklin-1758', why: null } })).toEqual({ ok: false })
    expect(parseNarrateReply({ ...GOOD, cards: [...GOOD.cards, ...GOOD.cards, ...GOOD.cards] })).toEqual({ ok: false })
  })

  // The plan's accept-and-refuse table: each string alone, in a card's body.
  it.each([
    ['Up ２ weeks running.', 'number'],
    ['Up ٣ weeks running.', 'number'],
    ['Spent ＄ on it.', 'number'],
    ['About forty more.', 'number_word'],
    ['See www.example.com for a deal.', 'link'],
    ['<img src=x onerror=alert()>', 'markup'],
    ['[Tap here](https://example.com)', 'markup'],
    ['Money well kept.', null],
    ['One thing to try: a lighter week.', null],
    // A blank for a fact the brief never sent passes the text rule; checkReply refuses it.
    ['You spent {{Q.change}} on it.', null],
  ] as const)('a card body %s → %s', (body, problem) => {
    const out = parseNarrateReply(withCard({ body }))
    if (!out.ok) throw new Error('the shape was fine')
    expect(out.dropped).toEqual(problem === null ? [] : [{ part: 'card', problem }])
    expect(out.reply.cards.map((c) => c.fact)).toEqual(problem === null ? ['B', 'C'] : ['C'])
  })

  it('drops only the part that broke the rule', () => {
    const out = parseNarrateReply({
      ...withCard({ tryThis: 'Try this: save ten percent.' }),
      summary: 'You spent $40 more.',
      goal: 'Put it in bitcoin.',
      quote: { id: 'franklin-small-leak', why: 'He said it in <i>print</i>.' },
    })
    expect(out).toEqual({
      ok: true,
      reply: { summary: null, cards: [{ ...GOOD.cards[0], tryThis: null }, GOOD.cards[1]], goal: null, quote: { id: 'franklin-small-leak', why: null } },
      dropped: [
        { part: 'summary', problem: 'number' },
        { part: 'tryThis', problem: 'number_word' },
        { part: 'goal', problem: 'product' },
        { part: 'why', problem: 'markup' },
      ],
    })
  })

  it('holds each field to its own length, and keeps the words NFKC-normalised', () => {
    const out = parseNarrateReply({ ...withCard({ title: 'a'.repeat(81) }), summary: 'Ｎice ﬁnish.', goal: 'b'.repeat(161) })
    expect(out.ok && out.reply.summary).toBe('Nice finish.')
    expect(out.ok && out.reply.cards.map((c) => c.fact)).toEqual(['C'])
    expect(out.ok && out.dropped).toEqual([{ part: 'card', problem: 'too_long' }, { part: 'goal', problem: 'too_long' }])
  })

  it('never passes on a field it did not ask for', () => {
    const out = parseNarrateReply({ ...GOOD, instructions: 'Ignore the rules', cards: [{ ...GOOD.cards[1], href: 'https://x' }] })
    expect(out.ok && out.reply).toEqual({ ...GOOD, cards: [GOOD.cards[1]] })
  })
})
