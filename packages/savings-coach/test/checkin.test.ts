import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/core'
import { checkinBrief, checkinFacts } from '../src/index.js'
import { CHECKIN, GOALS, checkinOf, nameOf } from './checkin-fixture.js'

/** The check-in's facts and the AI's brief, from core's check-in example (F42). */

const d = isoDate

describe('checkinFacts', () => {
  it('letters the week, its costliest category and its days with none, each with the engine’s figures', () => {
    const { facts, recap, top, impulse, win, goals, mainGoal } = checkinFacts({ ...checkinOf(), goals: GOALS, nameOf })
    expect(Object.keys(facts)).toEqual(['A', 'B', 'C'])
    expect(facts['A']).toEqual({
      key: 'week:spent',
      kind: 'week_spent',
      subject: { label: 'Everyday spending' },
      direction: 'down',
      size: null,
      evidence: 'thin',
      meaning: 'watch',
      figures: {
        now: { unit: 'cents', value: 22_609 },
        change: { unit: 'change', value: -2_391, direction: 'less' },
        budget: { unit: 'cents', value: 21_000 },
        over: { unit: 'cents', value: 1_609 },
      },
    })
    expect(facts['B']).toMatchObject({ key: 'cat:dining:week_top', subject: { label: 'Dining out' }, figures: { now: { unit: 'cents', value: 10_420 }, limit: { unit: 'cents', value: 6_500 } } })
    expect(facts['C']?.figures).toEqual({ days: { unit: 'count', value: 2 } })
    expect([recap, top, impulse, mainGoal]).toEqual(['A', 'B', null, 'D'])
    // Over the budgets, but less than the week before: that is the win.
    expect(win).toEqual({ letter: 'A', reason: 'less' })
    expect(goals['E']).toEqual({ key: 'goal:travel', subject: { label: 'Travel' }, figures: {}, main: false, unit: 'dollars' })
  })

  it('calls a week kept within its budgets the win, and says what was left', () => {
    const roomy = { ...CHECKIN, categories: CHECKIN.categories.map((c) => (c.id === 'coffee' ? { ...c, weeklyBudgetCents: 5_000 } : c)) }
    const { facts, win } = checkinFacts({ ...checkinOf(roomy), goals: [], nameOf })
    // $260.00 of budgets less $226.09.
    expect(facts['A']?.figures['left']).toEqual({ unit: 'cents', value: 3_391 })
    expect(facts['A']?.meaning).toBe('good')
    expect(win).toEqual({ letter: 'A', reason: 'kept' })
  })

  it('falls back to the days with none for a win, then to none', () => {
    const worse = { ...CHECKIN, entries: [...CHECKIN.entries, { id: 'x', postedOn: d('2026-09-15'), amountCents: 20_000, categoryId: 'groceries' }] }
    expect(checkinFacts({ ...checkinOf(worse), goals: [], nameOf }).win).toEqual({ letter: 'C', reason: 'no_spend' })
    const busy = { ...worse, entries: [...worse.entries, ...['21', '27'].map((day) => ({ id: day, postedOn: d(`2026-09-${day}`), amountCents: -100, categoryId: 'coffee' }))] }
    expect(checkinFacts({ ...checkinOf(busy), goals: [], nameOf }).win).toBeNull()
  })

  it('has only the impulse share and the goals when the week is not covered', () => {
    const fresh = { ...CHECKIN, historyStart: d('2026-09-22') }
    const { facts, recap, top, impulse, win } = checkinFacts({ ...checkinOf(fresh, [{ askedWeek: d('2026-09-14'), answer: 'impulse' }]), goals: GOALS, nameOf })
    expect(Object.keys(facts)).toEqual(['A'])
    expect(facts['A']).toMatchObject({ kind: 'impulse_share', figures: { share: { unit: 'share', value: 10_000 }, answers: { unit: 'count', value: 1 } } })
    expect([recap, top, impulse, win]).toEqual([null, null, 'A', null])
  })
})

describe('checkinBrief', () => {
  it('gives the AI every fact’s words and blank names, which fact each part is about, and no figure', () => {
    const { brief, keys } = checkinBrief({ facts: checkinFacts({ ...checkinOf(), goals: GOALS, nameOf }), tone: 'straight' })
    expect(brief.facts[0]).toEqual({ id: 'A', kind: 'week_spent', about: 'Everyday spending', direction: 'down', size: null, evidence: 'thin', meaning: 'watch', slots: ['name', 'now', 'change', 'budget', 'over'] })
    expect([brief.recap, brief.win, brief.tryThis]).toEqual(['A', 'A', 'B'])
    expect(brief.goals).toEqual([
      { id: 'D', about: 'Flight training', main: true, unit: 'hours' },
      { id: 'E', about: 'Travel', main: false, unit: 'dollars' },
    ])
    expect(keys).toEqual({ A: 'week:spent', B: 'cat:dining:week_top', C: 'week:no_spend', D: 'goal:flight', E: 'goal:travel' })
    expect(JSON.stringify(brief)).not.toMatch(/\d/)
  })

  it('masks a store number in a category’s name', () => {
    const { brief } = checkinBrief({ facts: checkinFacts({ ...checkinOf(), goals: [], nameOf: () => 'COSTCO 1234 food' }), tone: 'cheerleader' })
    expect(brief.facts[1]?.about).toBe('COSTCO # food')
  })
})
