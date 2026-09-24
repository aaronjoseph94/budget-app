import { describe, expect, it } from 'vitest'
import type { Fact } from '@budget/core'
import { LINE_TEMPLATES, dayLine } from '../src/index.js'
import { FACTS, factOf } from './fixtures.js'

const without = (kind: Fact['kind']) => FACTS.filter((f) => f.kind !== kind)

describe('dayLine', () => {
  it('words this month against the same days last month, by its meaning and the tone', () => {
    // The fixture's month is $125.00 more: watch.
    expect(dayLine({ facts: FACTS, tone: 'cheerleader' })).toEqual({ text: LINE_TEMPLATES.month_watch.cheerleader, factKey: 'summary:month' })
    expect(dayLine({ facts: FACTS, tone: 'straight' })).toEqual({ text: LINE_TEMPLATES.month_watch.straight, factKey: 'summary:month' })
    const good = FACTS.map((f) => (f.key === 'summary:month' ? { ...f, meaning: 'good' as const } : f))
    expect(dayLine({ facts: good, tone: 'cheerleader' })?.text).toBe(LINE_TEMPLATES.month_good.cheerleader)
  })

  it('falls back on this week when the records do not reach last month’s same days', () => {
    // The fixture's week is the same as last week's: info.
    expect(factOf('summary:week').meaning).toBe('info')
    expect(dayLine({ facts: without('month_so_far'), tone: 'cheerleader' })).toEqual({
      text: LINE_TEMPLATES.week_info.cheerleader,
      factKey: 'summary:week',
    })
  })

  it('is none without either summary', () => {
    expect(dayLine({ facts: without('month_so_far').filter((f) => f.kind !== 'week_so_far'), tone: 'straight' })).toBeNull()
  })
})
