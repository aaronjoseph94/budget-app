import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/core'
import { LIBRARY, pickQuote, quoteTags, type LibraryEntry, type QuoteTag } from '../src/index.js'
import { factOf } from './fixtures.js'

const d = isoDate

/** A small library, so each pick can be worked by hand. */
const entry = (id: string, tags: readonly QuoteTag[]): LibraryEntry => ({
  id, kind: 'quote', text: `The words of ${id}.`, by: 'Someone', attribution: 'wrote',
  source: { title: 'A book', year: 1900, locator: null }, sourceUrls: ['https://example.org/'], note: null, tags,
})
const library = [
  entry('one', ['saving']),
  entry('two', ['debt']),
  entry('three', ['saving', 'goal']),
  entry('four', ['debt', 'enough']),
  entry('five', ['flight']),
  entry('six', ['saving']),
  entry('seven', ['saving']),
  entry('eight', ['saving']),
  entry('nine', ['saving']),
]
// 24 September 2026 is day 20,720 since 1 January 1970: 20,720 mod 2 is 0, mod 6 is 2.
const asOf = d('2026-09-24')

describe('pickQuote', () => {
  it('shortlists the entries sharing most tags, and takes the day’s turn through them', () => {
    const picked = pickQuote({ tags: ['debt', 'enough'], asOf, recentIds: [], library })
    expect(picked.shortlist).toEqual(['four', 'two'])
    // 20,720 mod 2 is 0.
    expect(picked.entry?.id).toBe('four')
  })

  it('keeps the same pick all day and moves on the next', () => {
    const on = (day: string) => pickQuote({ tags: ['debt'], asOf: d(day), recentIds: [], library }).entry?.id
    // The shortlist is two, four: 20,720 mod 2 is 0, and 20,721 mod 2 is 1.
    expect(on('2026-09-24')).toBe('two')
    expect(on('2026-09-25')).toBe('four')
  })

  it('offers at most six, in the library’s order among equals', () => {
    const picked = pickQuote({ tags: ['saving'], asOf, recentIds: [], library })
    expect(picked.shortlist).toEqual(['one', 'three', 'six', 'seven', 'eight', 'nine'])
    expect(picked.entry?.id).toBe('six')
  })

  it('never repeats what this device showed in the last fortnight, until it has shown everything', () => {
    expect(pickQuote({ tags: ['debt'], asOf, recentIds: ['four'], library }).shortlist).toEqual(['two'])
    // Both debt lines shown lately: something fresh that matches nothing, in the library's order.
    expect(pickQuote({ tags: ['debt'], asOf, recentIds: ['two', 'four'], library }).shortlist).toEqual(['one', 'three', 'five', 'six', 'seven', 'eight'])
    // All of it shown lately: the round starts again.
    expect(pickQuote({ tags: ['debt'], asOf, recentIds: library.map((e) => e.id), library }).shortlist).toEqual(['two', 'four'])
  })

  it('falls back to the library’s order when no tag matches, and to nothing for an empty library', () => {
    expect(pickQuote({ tags: ['courage'], asOf, recentIds: ['one'], library }).shortlist).toEqual(['two', 'three', 'four', 'five', 'six', 'seven'])
    expect(pickQuote({ tags: ['debt'], asOf, recentIds: [], library: [] })).toEqual({ shortlist: [], entry: null })
  })

  it('always gives an entry from the committed library by default, words and author whole', () => {
    const picked = pickQuote({ tags: ['flight'], asOf, recentIds: [] })
    const found = LIBRARY.find((e) => e.id === picked.entry?.id)
    expect(found).toBeDefined()
    expect(picked.entry).toBe(found)
    for (const id of picked.shortlist) expect(LIBRARY.some((e) => e.id === id)).toBe(true)
  })
})

describe('quoteTags', () => {
  it('names what today’s facts are about, most important first, each once', () => {
    const tags = quoteTags({ facts: [factOf('cat:dining:change'), factOf('cat:fuel:over_budget'), factOf('cat:dining:change')], goal: null })
    expect(tags).toEqual(['small_leaks', 'impulse', 'over_budget', 'enough'])
  })

  it('reads a subscription as a small leak, a large or new charge as an impulse, and a repeat as a habit (F38, F39)', () => {
    const tags = (key: string) => quoteTags({ facts: [factOf(key)], goal: null })
    expect(tags('shop:SPOTIFY:price_rise')).toEqual(['subscriptions', 'small_leaks'])
    expect(tags('shop:GYM:new_subscription')).toEqual(['subscriptions', 'small_leaks'])
    expect(tags('charge:big:large')).toEqual(['impulse', 'enough'])
    expect(tags('charge:sofa:new_shop')).toEqual(['impulse', 'enough'])
    expect(tags('charges:k1:k2:possible_double')).toEqual(['habits'])
    expect(tags('charges:t1:t2:counted_twice')).toEqual(['habits'])
  })

  it('reads a steady rise as a leak and a habit, and a steady fall as a habit kept (F37)', () => {
    expect(quoteTags({ facts: [factOf('cat:dining:trend')], goal: null })).toEqual(['small_leaks', 'habits'])
    expect(quoteTags({ facts: [factOf('cat:groceries:trend')], goal: null })).toEqual(['habits', 'streaks'])
  })

  it('reads weeks within budget as a streak and a best month as a habit and saving (F40)', () => {
    expect(quoteTags({ facts: [factOf('habits:streak')], goal: null })).toEqual(['streaks', 'habits'])
    expect(quoteTags({ facts: [factOf('cat:dining:best')], goal: null })).toEqual(['habits', 'saving'])
  })

  it('adds the wins’ and the main goal’s, with hours and flight only where the goal has them', () => {
    const flight = { name: 'Flight training', unitLabel: 'flight time', hasHours: true }
    expect(quoteTags({ facts: [factOf('goal:g1:milestone'), factOf('summary:saved')], goal: flight })).toEqual([
      'milestone', 'goal', 'courage', 'saving', 'pay_yourself_first', 'hours', 'flight',
    ])
    expect(quoteTags({ facts: [], goal: { name: 'Emergency', unitLabel: null, hasHours: false } })).toEqual(['goal'])
  })
})
