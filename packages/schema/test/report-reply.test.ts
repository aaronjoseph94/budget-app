import { describe, expect, it } from 'vitest'
import { parseReportReply, type ReportReply } from '../src/report.js'

/**
 * A month's review as a model writes it (plan A15): the outer shape decides
 * whether anything is kept, then each string is held to the text rule
 * alone, so one bad sentence drops only its own part.
 */
const GOOD: ReportReply = {
  headline: 'A win on {{D.name}}: {{D.change}} than usual.',
  points: [
    { fact: 'A', text: 'You spent {{A.now}}, {{A.change}} than {{A.last_month}}.' },
    { fact: 'B', text: 'Saved {{B.now}}, {{B.rate}} of what came in.' },
    { fact: 'D', text: '{{D.name}} came in under its usual month.' },
  ],
  tryThis: 'Next month, cook at home a few nights a week.',
}

describe('parseReportReply', () => {
  it('keeps a review that follows every rule, from its text or as stored', () => {
    expect(parseReportReply(JSON.stringify(GOOD))).toEqual({ ok: true, reply: GOOD, dropped: [] })
    expect(parseReportReply(GOOD)).toEqual({ ok: true, reply: GOOD, dropped: [] })
  })

  it('drops a review whose shape is wrong, whole', () => {
    for (const bad of ['Here is your month.', '[]', 'null', '{', JSON.stringify({ ...GOOD, points: 'none' }), JSON.stringify({ ...GOOD, headline: undefined })]) {
      expect(parseReportReply(bad), bad).toEqual({ ok: false })
    }
    expect(parseReportReply({ ...GOOD, points: [{ fact: 'a1', text: 'x' }] })).toEqual({ ok: false })
    expect(parseReportReply({ ...GOOD, points: [...GOOD.points, GOOD.points[0]] })).toEqual({ ok: false })
  })

  it('drops a headline with a digit in it, and keeps the rest', () => {
    const parsed = parseReportReply({ ...GOOD, headline: 'You saved 12 dollars more than usual.' })
    expect(parsed).toEqual({ ok: true, reply: { ...GOOD, headline: null }, dropped: [{ part: 'headline', problem: 'number' }] })
  })

  it('drops each point or thing to try that breaks the rule, alone', () => {
    const parsed = parseReportReply({
      ...GOOD,
      points: [GOOD.points[0], { fact: 'B', text: 'Saved ４ times what you did.' }, { fact: 'D', text: 'Down forty on {{D.name}}.' }],
      tryThis: 'Put it in an index fund.',
    })
    expect(parsed).toEqual({
      ok: true,
      reply: { headline: GOOD.headline, points: [GOOD.points[0]], tryThis: null },
      dropped: [
        { part: 'point', problem: 'number' },
        { part: 'point', problem: 'number_word' },
        { part: 'tryThis', problem: 'product' },
      ],
    })
  })

  it('holds each part to its own length', () => {
    const parsed = parseReportReply({ ...GOOD, headline: 'a'.repeat(161), tryThis: 'b'.repeat(200) })
    expect(parsed.ok && parsed.reply.headline).toBeNull()
    expect(parsed.ok && parsed.reply.tryThis).toBe('b'.repeat(200))
  })
})
