import { describe, expect, it } from 'vitest'
import { reportBrief, reportFacts } from '../src/index.js'
import { AUGUST, PARTLY, SEPTEMBER, nameOf } from './report-fixture.js'

/** The review's facts and the AI's brief, from core's month-report example (F36). */

describe('reportFacts', () => {
  it('letters Spent, Saved and Income, then the rises and falls, each with the engine’s figures', () => {
    const { facts, points, tryThis, up, down, soFar } = reportFacts({ report: AUGUST, nameOf })
    expect(Object.keys(facts)).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(facts['A']).toEqual({
      key: 'report:spent',
      kind: 'month_spent',
      subject: { label: 'Spent' },
      direction: 'up',
      size: 'slight',
      evidence: 'thin',
      meaning: 'watch',
      figures: {
        now: { unit: 'cents', value: 206_000 },
        change: { unit: 'change', value: 3_000, direction: 'more' },
        last_month: { unit: 'month', value: '2026-07-01' },
        usual: { unit: 'cents', value: 198_500 },
      },
    })
    expect(facts['B']?.figures['rate']).toEqual({ unit: 'share', value: 1_190 })
    expect(facts['D']).toMatchObject({ key: 'cat:dining:mover', kind: 'mover_up', subject: { label: 'Dining out' }, meaning: 'watch', evidence: 'solid' })
    expect(facts['E']?.figures['change']).toEqual({ unit: 'change', value: -8_000, direction: 'less' })
    // Spent, Saved and the largest rise; the thing to try is about that rise.
    expect([points, tryThis, up, down, soFar]).toEqual([['A', 'B', 'D'], 'D', 'D', 'E', false])
  })

  it('says nothing against last month or the usual month when there is none', () => {
    const { facts, points, tryThis } = reportFacts({ report: PARTLY, nameOf })
    expect(facts['A']).toMatchObject({ direction: 'none', size: null, meaning: 'info', figures: { now: { unit: 'cents', value: 206_000 } } })
    expect(Object.keys(facts['A']!.figures)).toEqual(['now'])
    // No movers: Income makes the third point, and the thing to try is a general one.
    expect([points, tryThis]).toEqual([['A', 'B', 'C'], null])
  })

  it('marks a month so far, which has no usual totals', () => {
    const { facts, soFar } = reportFacts({ report: SEPTEMBER, nameOf })
    expect(soFar).toBe(true)
    expect(facts['A']?.figures['usual']).toBeUndefined()
  })
})

describe('reportBrief', () => {
  it('gives the AI every fact’s words and blank names, and no figure', () => {
    const { brief, keys } = reportBrief({ facts: reportFacts({ report: AUGUST, nameOf }), tone: 'straight' })
    expect(brief.facts[3]).toEqual({
      id: 'D',
      kind: 'mover_up',
      about: 'Dining out',
      direction: 'up',
      size: 'clear',
      evidence: 'solid',
      meaning: 'watch',
      slots: ['name', 'now', 'usual', 'change'],
    })
    expect([brief.tone, brief.points, brief.tryThis]).toEqual(['straight', ['A', 'B', 'D'], 'D'])
    expect(keys).toMatchObject({ A: 'report:spent', D: 'cat:dining:mover' })
    // No amount, month or rate travels: only words and names.
    expect(JSON.stringify(brief)).not.toMatch(/\d/)
  })

  it('masks a store number in a category’s name and cuts it to 40 characters', () => {
    const facts = reportFacts({ report: AUGUST, nameOf: () => `Shop 123456 ${'x'.repeat(60)}` })
    const about = reportBrief({ facts, tone: 'cheerleader' }).brief.facts[3]?.about
    expect(about).toBe(`Shop # ${'x'.repeat(33)}`)
  })
})
