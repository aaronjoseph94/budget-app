import { describe, expect, it } from 'vitest'
import { AddExpenseInputSchema, AmountTextSchema, ChangeSchema, ListSchema, NameSchema, NoteTextSchema, ReasonSchema, WordsSchema, drawsAsNothing, readsOneWay } from '../src/index.js'

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

  // mcp-01 (testing, 2026-10-05): every character Unicode marks
  // Default_Ignorable_Code_Point draws as nothing. Tag characters and
  // variation selectors got 'Groceries' past name_taken, and tags spell
  // hidden words a model reads.
  const DRAWN_AS_NOTHING = [
    0x34f, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180f, 0x206a, 0x206f, 0x3164, 0xfe00, 0xfe0f, 0xffa0, 0xfff0, 0x1bca0, 0x1d173, 0x1d17a,
    0xe0001, 0xe0020, 0xe0041, 0xe007f, 0xe0100, 0xe01ef,
  ]
  it.each(DRAWN_AS_NOTHING.map((c) => [c.toString(16).padStart(4, '0'), String.fromCodePoint(c)]))('refuses U+%s wherever an AI app writes words', (_, ch) => {
    expect(WordsSchema.safeParse(`Cof${ch}fee`).success).toBe(false)
    expect(NoteTextSchema.safeParse(`coffee${ch} 4.50`).success).toBe(false)
    expect(ReasonSchema.safeParse(`Fits recent spend.${ch}`).success).toBe(false)
    const add = { kind: 'add_category', name: `Groceries${ch}`, list: 'variable', reason: 'r' }
    expect(ChangeSchema.safeParse(add).success).toBe(false)
  })

  it('names exactly the characters Unicode says draw as nothing', () => {
    const unicode = /\p{Default_Ignorable_Code_Point}/u
    const differ: string[] = []
    for (let c = 0; c <= 0x10ffff; c++) {
      if (c >= 0xd800 && c <= 0xdfff) continue
      if (drawsAsNothing(c) !== unicode.test(String.fromCodePoint(c))) differ.push(c.toString(16))
    }
    expect(differ).toEqual([])
  })

  // Backend review of 2026-11-09: a space that is not the ordinary one, two
  // spaces in a row, or an accent as a letter and a mark, inside the words,
  // drew as the plain words do and compared as different, past name_taken
  // and "already waiting". Refused, not tidied: 0042 refuses the same.
  const ODD_SPACES = [0xa0, 0x1680, 0x2000, 0x2001, 0x2009, 0x200a, 0x202f, 0x205f, 0x2800, 0x3000]
  it.each(ODD_SPACES.map((c) => [c.toString(16).padStart(4, '0'), String.fromCodePoint(c)]))('refuses U+%s between words wherever an AI app writes words', (_, space) => {
    expect(WordsSchema.safeParse(`Lunch at${space}Subway`).success).toBe(false)
    expect(AddExpenseInputSchema.safeParse({ amount: '12.50', what: `Lunch at${space}Subway` }).success).toBe(false)
    expect(ReasonSchema.safeParse(`Fits${space}recent spend.`).success).toBe(false)
    expect(ChangeSchema.safeParse({ kind: 'add_category', name: `Eating${space}out`, list: 'variable', reason: 'r' }).success).toBe(false)
    expect(ChangeSchema.safeParse({ kind: 'rename_category', category: 'Coffee', new_name: `Eating${space}out`, reason: 'r' }).success).toBe(false)
  })

  it('refuses two spaces in a row and an accent as a letter and a mark, and takes the plain words as they are', () => {
    const [composed, decomposed] = ['Caf\u00e9', 'Cafe\u0301']
    expect(decomposed.normalize('NFC')).toBe(composed)
    for (const bad of ['Eating  out', decomposed, `${decomposed} cr\u00e8me`]) {
      expect([bad, WordsSchema.safeParse(bad).success, ReasonSchema.safeParse(bad).success]).toEqual([bad, false, false])
      expect(ChangeSchema.safeParse({ kind: 'add_category', name: bad, list: 'variable', reason: 'r' }).success).toBe(false)
      expect(ChangeSchema.safeParse({ kind: 'rename_category', category: 'Coffee', new_name: bad, reason: 'r' }).success).toBe(false)
    }
    // One ordinary space between words, an accent as one character, and a mark no single character holds.
    for (const good of ['Eating out', 'Eat in or out', composed, 'Cr\u00e8me br\u00fbl\u00e9e', 'x\u0301', '\u00a1Hola!', 'Tea\u2014two']) {
      expect([good, WordsSchema.parse(good), ReasonSchema.parse(good)]).toEqual([good, good, good])
      expect(ChangeSchema.parse({ kind: 'add_category', name: good, list: 'variable', reason: 'r' })).toMatchObject({ name: good })
    }
    // Either end is still trimmed, never refused, as before.
    expect(WordsSchema.parse('\u00a0Lunch at Subway\u2009 ')).toBe('Lunch at Subway')
  })

  it('says what to send instead, without echoing the words', () => {
    const issue = WordsSchema.safeParse('SECRET\u00a0shop').error?.issues[0]
    expect(issue?.message).toBe('Expected one plain space between words, and each accented letter as one character')
    expect(JSON.stringify(issue)).not.toContain('SECRET')
  })

  it('leaves a note\u2019s spacing and accents to its reader, and offers the same check for the words read out of it', () => {
    expect(NoteTextSchema.safeParse('coffee\u00a0 4.50  yesterday').success).toBe(true)
    expect(NoteTextSchema.safeParse('Cafe\u0301 4.50').success).toBe(true)
    expect(['Lunch at Subway', 'Lunch at\u00a0Subway', 'Lunch at  Subway', 'Lunch\u2800at Subway', 'Cafe\u0301', 'Caf\u00e9'].map(readsOneWay)).toEqual([true, false, false, false, false, true])
  })

  it('holds a note to 300 characters', () => {
    expect(NoteTextSchema.safeParse('coffee 4.50 yesterday').success).toBe(true)
    expect(NoteTextSchema.safeParse('x'.repeat(301)).success).toBe(false)
  })
})
