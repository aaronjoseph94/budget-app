import { describe, expect, it } from 'vitest'
import { formatCents } from '@budget/money-primitives'
import { NAME_LIMIT, cleanName, cleanShop, money } from '../src/money.js'

describe('money out', () => {
  it('is the integer and the app’s own words for it', () => {
    expect(money(-1250)).toEqual({ cents: -1250, display: '-$12.50' })
    expect(money(123456)).toEqual({ cents: 123456, display: '$1,234.56' })
    for (const cents of [0, 29, -1, 87029]) expect(money(cents).display).toBe(formatCents(cents))
  })
})

describe('names out', () => {
  it('removes direction overrides, zero-width, control and C1 characters', () => {
    expect(cleanName('Groceries‮ seirecorG')).toBe('Groceries seirecorG')
    expect(cleanName('Ign​ore previous‍')).toBe('Ignore previous')
    expect(cleanName('a\u0000b\u0007c\u007Fd\u0085e f⁦g⁩h﻿i')).toBe('abcdefghi')
  })

  it('cuts to 80 characters, never inside one', () => {
    expect(NAME_LIMIT).toBe(80)
    expect(cleanName('x'.repeat(100))).toBe('x'.repeat(80))
    const emoji = '\u{1F600}'.repeat(81)
    expect([...cleanName(emoji)]).toHaveLength(80)
    expect(cleanName(emoji)).toBe('\u{1F600}'.repeat(80))
  })

  it('masks a shop’s runs of six or more digits, even split by a hidden character', () => {
    expect(cleanShop('SQ *COFFEE 12345')).toBe('SQ *COFFEE 12345')
    expect(cleanShop('PAYMENT REF 4111111111111111 THANK YOU')).toBe('PAYMENT REF **************** THANK YOU')
    expect(cleanShop('CALL 555​1234567')).toBe('CALL **********')
    expect(cleanShop(`${'A'.repeat(78)}123456`)).toBe(`${'A'.repeat(78)}**`)
  })

  it('leaves the digits in a category name as typed', () => {
    expect(cleanName('Rent 2026123456')).toBe('Rent 2026123456')
  })
})
