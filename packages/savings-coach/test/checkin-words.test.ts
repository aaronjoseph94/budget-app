import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/core'
import { proseProblem, type CheckinReply } from '@budget/schema'
import { TONES, checkCheckinReply, checkinBrief, checkinFacts, checkinWords, mergeCheckin, renderSegments, type CheckinFacts } from '../src/index.js'
import { CHECKIN, GOALS, checkinOf, nameOf } from './checkin-fixture.js'

/** The check-in in the app's own words, and a model's checked against what it was offered (ADR 0005 §4). */

const d = isoDate
const facts = (input = CHECKIN, answers: Parameters<typeof checkinOf>[1] = []) => checkinFacts({ ...checkinOf(input, answers), goals: GOALS, nameOf })
const OVER = facts()
const KEPT = facts({ ...CHECKIN, categories: CHECKIN.categories.map((c) => (c.id === 'coffee' ? { ...c, weeklyBudgetCents: 5_000 } : c)) })
const FRESH = facts({ ...CHECKIN, historyStart: d('2026-09-21') }, [{ askedWeek: d('2026-09-21'), answer: 'planned' }])
const UNCOVERED = checkinFacts({ ...checkinOf({ ...CHECKIN, historyStart: d('2026-09-22') }), goals: [], nameOf })
const slotsOf = (f: CheckinFacts) => Object.fromEntries([...Object.entries(f.facts), ...Object.entries(f.goals)].map(([l, x]) => [l, ['name', ...Object.keys(x.figures)]]))
const LIMITS = { recap: 200, win: 160, tryThis: 200, goal: 160 }

describe('checkinWords', () => {
  it('passes the text rule, and names only figures its facts have, in every tone and every kind of week', () => {
    for (const f of [OVER, KEPT, FRESH, UNCOVERED]) {
      for (const tone of TONES) {
        const words = checkinWords({ facts: f, tone })
        for (const part of ['recap', 'win', 'tryThis', 'goal'] as const) {
          const text = words[part]
          if (text === null) continue
          expect(proseProblem(text, LIMITS[part]), text).toBeNull()
          expect(renderSegments({ text, slots: slotsOf(f) }).ok, text).toBe(true)
        }
      }
    }
  })

  it('recaps a week over its budgets, cheers the fall from the week before, and suggests the limit', () => {
    expect(checkinWords({ facts: OVER, tone: 'cheerleader' })).toEqual({
      recap: 'Last week you spent {{A.now}} on everyday things. That went {{A.over}} past your weekly budgets.',
      win: 'You spent {{A.change}} than the week before. That’s a win!',
      tryThis: 'Try keeping {{B.name}} under {{B.limit}} next week.',
      goal: 'Every lighter week brings {{D.name}} closer. Keep going!',
    })
  })

  it('says what was left of a kept week, and has no recap or goal line without a covered week or a goal', () => {
    expect(checkinWords({ facts: KEPT, tone: 'straight' }).recap).toBe('Everyday spending last week: {{A.now}}, {{A.change}} than the week before. Left in your weekly budgets: {{A.left}}.')
    expect(checkinWords({ facts: KEPT, tone: 'straight' }).win).toBe('You kept within your weekly budgets.')
    expect(checkinWords({ facts: FRESH, tone: 'straight' }).recap).toBe('Everyday spending last week: {{A.now}}. Over your weekly budgets by {{A.over}}.')
    expect(checkinWords({ facts: UNCOVERED, tone: 'cheerleader' })).toEqual({
      recap: null,
      win: 'You showed up for your check-in, and that habit is a win on its own.',
      tryThis: 'Try moving your savings on payday, before the spending starts.',
      goal: null,
    })
  })
})

describe('checkCheckinReply and mergeCheckin', () => {
  const { brief } = checkinBrief({ facts: OVER, tone: 'cheerleader' })
  const GOOD: CheckinReply = {
    recap: 'A steadier week: {{A.now}} on everyday things.',
    win: 'You spent {{A.change}} than the week before, a real step.',
    tryThis: 'Cook at home a few nights, and keep {{B.name}} under {{B.limit}}.',
    goal: 'Each calm week brings {{D.name}} and {{E.name}} closer.',
  }

  it('keeps a reply that names only what each part was offered', () => {
    expect(checkCheckinReply({ reply: GOOD, brief })).toEqual({ reply: GOOD, dropped: [] })
  })

  it('drops each part that names another part’s fact, a slot it lacks, or a rise beside a fall, alone', () => {
    const { reply, dropped } = checkCheckinReply({
      reply: { recap: 'You spent {{A.change}} than before, and spending rose.', win: 'Keep {{B.name}} down.', tryThis: 'Try {{B.name}} under {{A.now}}.', goal: 'Keep going on {{D.left}}.' },
      brief,
    })
    expect(reply).toEqual({ recap: null, win: null, tryThis: null, goal: null })
    expect(dropped.map((x) => [x.part, x.reason])).toEqual([
      ['recap', 'direction'],
      ['win', 'unknown_fact'],
      ['tryThis', 'unknown_fact'],
      ['goal', 'unknown_slot'],
    ])
  })

  it('lets the recap name the impulse share, and no other part', () => {
    const withImpulse = facts(CHECKIN, [{ askedWeek: d('2026-09-21'), answer: 'impulse' }])
    const share = `You called {{${withImpulse.impulse!}.share}} of your answered charges impulse.`
    const { reply, dropped } = checkCheckinReply({ reply: { recap: share, win: share, tryThis: null, goal: null }, brief: checkinBrief({ facts: withImpulse, tone: 'straight' }).brief })
    expect(reply.recap).toBe(share)
    expect(reply.win).toBeNull()
    expect(dropped.map((x) => x.part)).toEqual(['win'])
  })

  it('shows the AI’s words where they passed and the app’s own everywhere else, and nothing the app has no words for', () => {
    const own = checkinWords({ facts: OVER, tone: 'cheerleader' })
    const merged = mergeCheckin({ own, ai: { ...GOOD, win: null } })
    expect(merged.recap).toEqual({ text: GOOD.recap, ai: true })
    expect(merged.win).toEqual({ text: own.win, ai: false })
    expect(mergeCheckin({ own: { ...own, goal: null }, ai: GOOD }).goal).toBeNull()
    expect(mergeCheckin({ own, ai: null }).tryThis).toEqual({ text: own.tryThis, ai: false })
  })
})
