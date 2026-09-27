import { describe, expect, it } from 'vitest'
import { parseCheckinReply, type CheckinReply } from '../src/index.js'

/**
 * The Sunday check-in as a model writes it (plan A20): the outer shape
 * decides whether anything is kept, then each string is held to the text
 * rule alone, so one bad sentence drops only its own part.
 */
const GOOD: CheckinReply = {
  recap: 'Last week you spent {{A.now}} on everyday things, {{A.change}} than the week before.',
  win: 'A calmer week than the one before. Nicely done!',
  tryThis: 'Try keeping {{B.name}} under {{B.limit}} next week.',
  goal: 'Every lighter week brings {{C.name}} closer.',
}

describe('parseCheckinReply', () => {
  it('keeps a check-in that follows every rule, from its text or as stored', () => {
    expect(parseCheckinReply(JSON.stringify(GOOD))).toEqual({ ok: true, reply: GOOD, dropped: [] })
    expect(parseCheckinReply(GOOD)).toEqual({ ok: true, reply: GOOD, dropped: [] })
    const none = { recap: null, win: null, tryThis: null, goal: null }
    expect(parseCheckinReply(none)).toEqual({ ok: true, reply: none, dropped: [] })
  })

  it('drops a check-in whose shape is wrong, whole', () => {
    for (const bad of ['Here is your week.', '[]', 'null', '{', JSON.stringify({ ...GOOD, win: undefined }), JSON.stringify({ ...GOOD, recap: 4 })]) {
      expect(parseCheckinReply(bad), bad).toEqual({ ok: false })
    }
  })

  it('drops each part that breaks the rule, alone, and keeps the rest', () => {
    const parsed = parseCheckinReply({ ...GOOD, recap: 'You spent 226 dollars.', win: 'Twice as good as last week!', goal: '<img src=x onerror=alert(1)>' })
    expect(parsed).toEqual({
      ok: true,
      reply: { recap: null, win: null, tryThis: GOOD.tryThis, goal: null },
      dropped: [
        { part: 'recap', problem: 'number' },
        { part: 'win', problem: 'number_word' },
        { part: 'goal', problem: expect.any(String) },
      ],
    })
  })

  it('keeps each part in its NFKC form', () => {
    const parsed = parseCheckinReply({ ...GOOD, win: '\uFF21 calmer week.' })
    expect(parsed.ok && parsed.reply.win).toBe('A calmer week.')
  })

  it('holds each part to its own length', () => {
    const parsed = parseCheckinReply({ ...GOOD, win: 'a'.repeat(161), tryThis: 'b'.repeat(200) })
    expect(parsed.ok && parsed.reply.win).toBeNull()
    expect(parsed.ok && parsed.reply.tryThis).toBe('b'.repeat(200))
  })
})
