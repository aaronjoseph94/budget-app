import { describe, expect, it } from 'vitest'
import { toCsv } from '../src/index.js'

/** Suite tests: each file below written out by hand, byte for byte. */

describe('toCsv', () => {
  it('writes rows as lines ending in CR LF, as RFC 4180 asks', () => {
    expect(toCsv([['Date', 'Shop'], ['2026-09-03', 'Corner Cafe']])).toBe('Date,Shop\r\n2026-09-03,Corner Cafe\r\n')
  })

  it('writes nothing for no rows', () => {
    expect(toCsv([])).toBe('')
  })

  // N4: a spreadsheet runs a cell starting with these as a formula, and a shop's name is whatever the shop chose.
  it.each([
    ['=cmd|/C calc!A0', "'=cmd|/C calc!A0"],
    ['+1', "'+1"],
    ['-2+3', "'-2+3"],
    ['@x', "'@x"],
    ['\tTAB', "'\tTAB"],
  ])('puts an apostrophe before a text cell starting %j', (cell, written) => {
    expect(toCsv([[cell]])).toBe(`${written}\r\n`)
  })

  it('guards a carriage return, and then quotes the cell for it', () => {
    expect(toCsv([['\r=1+1']])).toBe(`"'\r=1+1"\r\n`)
  })

  it('leaves a text cell with a formula sign further in alone', () => {
    expect(toCsv([['Cafe = good', 'a+b', 'me@x']])).toBe('Cafe = good,a+b,me@x\r\n')
  })

  it('writes a negative amount cell as a number, with no apostrophe', () => {
    expect(toCsv([[{ number: '-32.74' }, { number: '1234.56' }, { number: '0.00' }]])).toBe('-32.74,1234.56,0.00\r\n')
  })

  it.each(['=1+1', '1,234.56', '$5.00', '12.', '.5', '', '1e5', ' 5'])('refuses %j as an amount cell, so a number cannot carry a formula past the guard', (bad) => {
    expect(() => toCsv([[{ number: bad }]])).toThrow(RangeError)
  })

  it('quotes a cell holding a comma, a quote or a line break, doubling the quote', () => {
    expect(toCsv([['Smith, J', 'The "Best" Shop', 'two\nlines', 'cr\rhere']])).toBe(
      '"Smith, J","The ""Best"" Shop","two\nlines","cr\rhere"\r\n',
    )
  })

  it('guards and quotes a cell that needs both', () => {
    expect(toCsv([['=HYPERLINK("x","y")']])).toBe(`"'=HYPERLINK(""x"",""y"")"\r\n`)
  })

  it('writes an empty text cell as nothing between the commas', () => {
    expect(toCsv([['a', '', 'b']])).toBe('a,,b\r\n')
  })
})
