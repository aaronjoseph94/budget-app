import { describe, expect, it } from 'vitest'
import { CategoryKindSchema } from '../src/index.js'

describe('CategoryKindSchema', () => {
  // Migration 0005's enum, value for value and in its order. The app shows
  // the lists in this order, and a value missing here would be a list the
  // database accepts and the app cannot show.
  it('holds exactly the lists of migration 0005, in order', () => {
    expect(CategoryKindSchema.options).toEqual([
      'income',
      'savings',
      'bill',
      'debt',
      'subscription',
      'variable',
      'transfer',
    ])
  })

  it('refuses a list the database does not have', () => {
    expect(CategoryKindSchema.safeParse('spending').success).toBe(false)
    expect(CategoryKindSchema.safeParse('').success).toBe(false)
  })
})
