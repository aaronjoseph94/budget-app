import { describe, expect, it } from 'vitest'
import { putOffStep, setupProgress, type SetupCheck } from '../src/index.js'

/** Suite tests, worked by hand from F49 (docs/formula-decisions.md). */

const IDS = ['name', 'lists', 'pay', 'bills', 'goals', 'statement', 'balance', 'ai', 'phone'] as const
const steps = (checks: Partial<Record<(typeof IDS)[number], SetupCheck>>) => IDS.map((id) => ({ id, check: checks[id] ?? 'not_done' }))

describe('setupProgress (F49)', () => {
  it('counts only what is done, and names the first step not done', () => {
    const progress = setupProgress({ steps: steps({ name: 'done', lists: 'done', bills: 'done' }), later: [] })
    expect(progress.steps.map((s) => s.id)).toEqual(IDS)
    expect(progress).toMatchObject({ done: 3, total: 9, next: 'pay', finished: false })
  })

  it('never counts a step whose read failed, and may name it next', () => {
    // F49's example: the pay schedule's read failed.
    const progress = setupProgress({ steps: steps({ name: 'done', lists: 'done', pay: 'unknown', bills: 'done' }), later: ['goals', 'phone'] })
    expect(progress.steps.map((s) => s.id)).toEqual(['name', 'lists', 'pay', 'bills', 'statement', 'balance', 'ai', 'goals', 'phone'])
    expect(progress.steps.find((s) => s.id === 'pay')).toEqual({ id: 'pay', check: 'unknown', later: false, position: 3 })
    expect(progress).toMatchObject({ done: 3, next: 'pay', finished: false })
  })

  it('moves each step put off to the end, in the order it was put off', () => {
    const all = steps({ name: 'done', lists: 'done', pay: 'done', bills: 'done', statement: 'done', balance: 'done', ai: 'done' })
    const progress = setupProgress({ steps: all, later: ['phone', 'goals'] })
    expect(progress.steps.map((s) => [s.id, s.later, s.position])).toEqual([
      ...['name', 'lists', 'pay', 'bills', 'statement', 'balance', 'ai'].map((id, i) => [id, false, i + 1]),
      ['phone', true, 8],
      ['goals', true, 9],
    ])
    // A step put off is still next when everything before it is done.
    expect(progress.next).toBe('phone')
    // An id the guide does not have is passed over.
    expect(setupProgress({ steps: all, later: ['gone', 'goals'] }).steps.at(-1)?.id).toBe('goals')
    // A step named twice is where it was last put off.
    const twice = setupProgress({ steps: all, later: ['goals', 'phone', 'goals'] })
    expect(twice.steps.slice(-3).map((s) => s.id)).toEqual(['ai', 'phone', 'goals'])
    expect(twice.total).toBe(9)
  })

  it('is finished when all nine are done, put off or not', () => {
    const done = IDS.map((id) => ({ id, check: 'done' as const }))
    expect(setupProgress({ steps: done, later: ['ai'] })).toMatchObject({ done: 9, total: 9, next: null, finished: true })
  })

  it('refuses a guide that names a step twice', () => {
    expect(() => setupProgress({ steps: [...steps({}), { id: 'name', check: 'done' }], later: [] })).toThrow(RangeError)
  })
})

describe('putOffStep (F49)', () => {
  it('sends a step to the back of the line, even one already put off', () => {
    expect(putOffStep({ later: [], id: 'goals' })).toEqual({ later: ['goals'] })
    expect(putOffStep({ later: ['goals'], id: 'phone' })).toEqual({ later: ['goals', 'phone'] })
    expect(putOffStep({ later: ['goals', 'phone'], id: 'goals' })).toEqual({ later: ['phone', 'goals'] })
  })
})
