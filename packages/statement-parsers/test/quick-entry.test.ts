import { describe, expect, it } from 'vitest'
import { isoDate } from '@budget/money-primitives'
import { parseQuickEntry, type QuickEntry } from '../src/index.js'

// Just type it (plan A22; F47's worked example). Sunday 2026-09-27 is
// today. Shop names are invented; the one learned rule files LITWARE COFFEE.
const asOf = isoDate('2026-09-27')
const rules = new Map([['LITWARE COFFEE', 'cat-coffee']])
const read = (text: string): QuickEntry => parseQuickEntry({ text, asOf, rules })

describe('parseQuickEntry reads one typed line into the form', () => {
  it('reads "4.50 coffee" as spent today', () => {
    expect(read('4.50 coffee')).toEqual({ amount: 450, date: '2026-09-27', flow: 'spent', flowSaid: false, shop: 'coffee', categoryId: null })
  })

  it('reads "coffee $12 yesterday"', () => {
    expect(read('coffee $12 yesterday')).toMatchObject({ amount: 1200, date: '2026-09-26', shop: 'coffee' })
  })

  it('reads "paid 1200 rent monday" as rent paid, on the Monday just gone', () => {
    expect(read('paid 1200 rent monday')).toEqual({ amount: 120000, date: '2026-09-21', flow: 'spent', flowSaid: false, shop: 'rent', categoryId: null })
  })

  it('reads "got paid 2100" as received, with no shop', () => {
    expect(read('got paid 2100')).toMatchObject({ amount: 210000, flow: 'received', flowSaid: true, shop: null })
  })

  it('reads received, earned and a refund as money in', () => {
    expect(read('refund 20 hardware store')).toMatchObject({ flow: 'received', shop: 'hardware store' })
    expect(read('earned 80 babysitting')).toMatchObject({ flow: 'received', shop: 'babysitting' })
    expect(read('received 1,500.00 from Northwind')).toMatchObject({ amount: 150000, flow: 'received', shop: 'Northwind' })
  })

  it('files the shop by an exact learned rule, as an import would', () => {
    expect(read('Litware Coffee 5.25')).toMatchObject({ shop: 'Litware Coffee', categoryId: 'cat-coffee' })
    expect(read('Litware Coffee Roasters 5.25').categoryId).toBeNull()
  })
})

describe('parseQuickEntry leaves the amount empty rather than guess', () => {
  it('leaves "3 coffees 12" empty: either could be the amount', () => {
    expect(read('3 coffees 12')).toMatchObject({ amount: null, shop: '3 coffees 12' })
  })

  it('prefers the one number with a dollar sign, then the one with cents', () => {
    expect(read('3 coffees $12')).toMatchObject({ amount: 1200, shop: '3 coffees' })
    expect(read('3 coffees 12.50')).toMatchObject({ amount: 1250, shop: '3 coffees' })
    expect(read('$3 and $12 lunch').amount).toBeNull()
  })

  it('reads commas grouping thousands and drops the word dollars', () => {
    expect(read('spent 1,250 dollars on the Keg')).toMatchObject({ amount: 125000, shop: 'the Keg' })
  })

  it('leaves no amount for a zero, a badly grouped number or none at all', () => {
    expect(read('coffee 0').amount).toBeNull()
    expect(read('coffee 12,34').amount).toBeNull()
    expect(read('coffee').amount).toBeNull()
  })
})

describe('parseQuickEntry reads the day, and leaves it empty when it cannot be sure', () => {
  it('counts a weekday back to its latest, today included, and last Sunday as the one before', () => {
    expect(read('lunch 9 sunday').date).toBe('2026-09-27')
    expect(read('lunch 9 last sunday').date).toBe('2026-09-20')
    expect(read('lunch 9 saturday').date).toBe('2026-09-26')
  })

  it('reads a month by name either way round, with or without a year', () => {
    expect(read('lunch 9 sep 3').date).toBe('2026-09-03')
    expect(read('lunch 9 3rd September').date).toBe('2026-09-03')
    expect(read('lunch 9 Aug 21, 2025').date).toBe('2025-08-21')
    expect(read('lunch 9 2026-09-01')).toMatchObject({ date: '2026-09-01', amount: 900, shop: 'lunch' })
  })

  it('leaves the day empty for a date after today, one that does not exist, slashes or two days', () => {
    expect(read('lunch 9 sep 30').date).toBeNull()
    expect(read('lunch 9 feb 30').date).toBeNull()
    expect(read('lunch 9 9/3').date).toBeNull()
    expect(read('lunch 9 yesterday monday').date).toBeNull()
  })

  // Testing fuzz-06: a year typed below 1000 came out as '19-01-05', no ISO
  // date at all. A year before 1900 is a typo, as on a statement.
  it('leaves the day empty for a year before 1900', () => {
    for (const text of ['coffee 4.50 0019-01-05', 'coffee 4.50 jan 5 0019', 'coffee 4.50 1899-12-31']) expect(read(text).date).toBeNull()
    expect(read('coffee 4.50 1900-01-01').date).toBe('1900-01-01')
  })

  it('takes the same day said twice as that day', () => {
    expect(read('lunch 9 today sep 27').date).toBe('2026-09-27')
  })
})
