import { describe, expect, it } from 'vitest'
import { AmountTextSchema, ListSchema, NameSchema, NoteTextSchema, WordsSchema } from '../src/index.js'

// What an AI app may send the server's tools (PLAN §2.4).
describe('AmountTextSchema', () => {
  it.each(['12.50', '12.5', '12', '$12.50', '1,234.56', '$1,234', '999999.99', '100,000.00', '0.01'])('takes %j', (text) => {
    expect(AmountTextSchema.safeParse(text).success).toBe(true)
  })

  it.each(['', '-5', '12.345', '1,23', '1234567', '12,34.00', '$', '.50', '1e3', ' 12'])('refuses %j', (text) => {
    expect(AmountTextSchema.safeParse(text).success).toBe(false)
  })

  it('refuses a JSON number, so no float arrives', () => {
    expect(AmountTextSchema.safeParse(12.5).success).toBe(false)
  })

  it('names the problem without echoing the value', () => {
    const issue = AmountTextSchema.safeParse('SECRET-12').error?.issues[0]
    expect(issue?.message).toBe('Expected an amount like 12.50')
    expect(JSON.stringify(issue)).not.toContain('SECRET')
  })
})

describe('the words an AI app sends', () => {
  it('trims a name, and holds it to 1–60 characters', () => {
    expect(NameSchema.parse('  Groceries ')).toBe('Groceries')
    expect(NameSchema.safeParse('   ').success).toBe(false)
    expect(NameSchema.safeParse('x'.repeat(61)).success).toBe(false)
  })

  it('takes the six lists, never Not spending', () => {
    expect(ListSchema.options).toEqual(['variable', 'bill', 'debt', 'subscription', 'income', 'savings'])
    expect(ListSchema.safeParse('transfer').success).toBe(false)
  })

  it('holds what was added to ingested text: trimmed, 1–120, no control or direction characters', () => {
    expect(WordsSchema.parse(' Lunch at Subway ')).toBe('Lunch at Subway')
    expect(WordsSchema.safeParse('x'.repeat(120)).success).toBe(true)
    for (const bad of ['', '  ', 'x'.repeat(121), 'Lunch\tat Subway', 'Lunch‮yawbus', 'a\u0085b']) {
      expect(WordsSchema.safeParse(bad).success).toBe(false)
    }
  })

  // Security review mcp-2-05: characters that draw as nothing let two Review rows
  // look the same while hashing apart. Refused where an AI app adds, not at
  // every ingested boundary, where a shop's name may need U+200C or U+200D.
  const INVISIBLE = [0xad, 0x61c, 0x180e, 0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2065, 0xfeff]
  it.each(INVISIBLE.map((c) => [c.toString(16).padStart(4, '0'), String.fromCharCode(c)]))('refuses U+%s in what an AI app adds or notes', (_, ch) => {
    expect(WordsSchema.safeParse(`Cof${ch}fee`).success).toBe(false)
    expect(NoteTextSchema.safeParse(`coffee${ch} 4.50`).success).toBe(false)
  })

  it('holds a note to 300 characters', () => {
    expect(NoteTextSchema.safeParse('coffee 4.50 yesterday').success).toBe(true)
    expect(NoteTextSchema.safeParse('x'.repeat(301)).success).toBe(false)
  })
})
