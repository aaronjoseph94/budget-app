import { describe, expect, it } from 'vitest'
import { goalActualColumns, incomeExpenseColumns } from '../src/columns.js'

/** Suite tests: coordinates worked by hand on the 3,000-unit grid; the plot runs 1,400 units up from y = 1660. */

const frame = { id: 'cols', title: 'Monthly income and expenses', description: 'The year by month.' }
// The key's swatches carry rx before their fill, so only columns match.
const rects = (svg: string) =>
  [...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9A-F]{6})"/g)]
    .map((m) => m.slice(1).join(' '))

describe('incomeExpenseColumns', () => {
  it('stacks expenses on income in each month, from the baseline, on core’s scale', () => {
    const svg = incomeExpenseColumns({
      ...frame,
      columns: [
        { label: 'Jan', valueText: 'in $300, out $100', parts: [{ fromBp: 0, toBp: 7_500 }, { fromBp: 7_500, toBp: 10_000 }] },
        { label: 'Feb & <co>', valueText: 'out $200', parts: [null, { fromBp: 0, toBp: 5_000 }] },
      ],
    })
    // Two columns of 1,500 units, each bar 900 wide and centred.
    expect(rects(svg)).toEqual(['300 610 900 1050 #D7EEEB', '300 260 900 350 #F9D7D2', '1800 960 900 700 #F9D7D2'])
    expect(svg).toContain('<title>Feb &amp; &lt;co&gt;: out $200</title>')
    expect(svg).not.toContain('<co>')
  })

  it('draws nothing for a part too thin to reach a unit', () => {
    const svg = incomeExpenseColumns({ ...frame, columns: [{ label: 'Jan', valueText: '', parts: [{ fromBp: 0, toBp: 3 }, null] }] })
    expect(rects(svg)).toEqual([])
  })
})

describe('goalActualColumns', () => {
  it('puts Goal beside Actual for each list, on one scale', () => {
    const svg = goalActualColumns({
      ...frame,
      groups: [
        { label: 'Income', valueText: '$500 of $1,000', goalBp: 10_000, actualBp: 5_000 },
        { label: 'Subscriptions', valueText: '$250', goalBp: null, actualBp: 2_500 },
      ],
    })
    expect(rects(svg)).toEqual(['215 260 525 1400 #517070', '760 960 525 700 #E6E1CE', '2260 1310 525 350 #E6E1CE'])
    // 1,480 units at the smaller label size is 26 characters: a long name fits whole.
    expect(svg).toContain('>Subscriptions</text>')
  })
})
