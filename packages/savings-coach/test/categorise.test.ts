import { describe, expect, it } from 'vitest'
import { categoriseBatches, suggestionsOf, type CategoriseInput } from '../src/index.js'

/** Suite tests, worked by hand from F46 (docs/formula-decisions.md). Shop names are invented. */
const CATEGORIES: CategoriseInput['categories'] = [
  { id: 'groceries', name: 'Groceries', kind: 'variable' },
  { id: 'cards', name: 'Card payments', kind: 'transfer' },
  { id: 'pay', name: 'Pay', kind: 'income' },
]
const row = (id: string, merchant: string, amountCents: number, categoryId: string | null = null) => ({ id, merchant, amountCents, categoryId })
const input = (over: Partial<CategoriseInput> = {}): CategoriseInput => ({
  rows: [row('p1', 'CORNER MARKET', -6_412), row('p2', 'LITWARE COFFEE', -450), row('p3', 'ADVENTURE WORKS', 210_000)],
  categories: CATEGORIES,
  learned: new Set(),
  ...over,
})

describe('categoriseBatches (F46)', () => {
  it('sends each row as a number, its shop, spent or received and a band, and the categories as aliases, Not spending left out', () => {
    const { batches } = categoriseBatches(input())
    expect(batches).toHaveLength(1)
    expect(batches[0]!.brief).toEqual({
      rows: [
        { i: 1, shop: 'CORNER MARKET', flow: 'spent', size: 'medium' },
        { i: 2, shop: 'LITWARE COFFEE', flow: 'spent', size: 'small' },
        { i: 3, shop: 'ADVENTURE WORKS', flow: 'received', size: 'large' },
      ],
      categories: [
        { alias: 'c1', name: 'Groceries', list: 'variable' },
        { alias: 'c2', name: 'Pay', list: 'income' },
      ],
    })
    expect(batches[0]!.rows).toEqual({ 1: ['p1'], 2: ['p2'], 3: ['p3'] })
    expect(batches[0]!.aliases).toEqual({ c1: 'groceries', c2: 'pay' })
  })

  it('leaves out a row with a category stored or a learned rule for its shop', () => {
    const { batches } = categoriseBatches(input({ rows: [row('p1', 'CORNER MARKET', -6_412, 'groceries'), row('p2', 'LITWARE COFFEE', -450)], learned: new Set(['LITWARE COFFEE']) }))
    expect(batches).toEqual([])
  })

  it('asks once about rows sharing a shop, a direction and a band, and proposes for each', () => {
    const { batches } = categoriseBatches(input({ rows: [row('p1', 'LITWARE COFFEE', -450), row('p2', 'LITWARE COFFEE', -525), row('p3', 'LITWARE COFFEE', -2_400), row('p4', 'LITWARE COFFEE', 450)] }))
    expect(batches[0]!.brief.rows.map((r) => [r.i, r.flow, r.size])).toEqual([[1, 'spent', 'small'], [2, 'spent', 'medium'], [3, 'received', 'small']])
    expect(batches[0]!.rows).toEqual({ 1: ['p1', 'p2'], 2: ['p3'], 3: ['p4'] })
  })

  it('masks a run of four or more digits and cuts a name to 40 characters', () => {
    const { batches } = categoriseBatches(input({ rows: [row('p1', 'CARD 4520123412341234 PAYMENT TO A VERY LONG SHOP NAME INDEED', -100)] }))
    expect(batches[0]!.brief.rows[0]!.shop).toBe('CARD # PAYMENT TO A VERY LONG SHOP NAME ')
  })

  it('holds a batch to 40 rows', () => {
    const many = Array.from({ length: 41 }, (_, n) => row(`p${n}`, `SHOP ${String.fromCharCode(65 + (n % 26))}${String.fromCharCode(65 + Math.floor(n / 26))}`, -100))
    const { batches } = categoriseBatches(input({ rows: many }))
    expect(batches.map((b) => b.brief.rows.length)).toEqual([40, 1])
    expect(batches[1]!.brief.rows[0]!.i).toBe(1)
  })

  it('holds a batch to about 2,500 tokens, its JSON bytes over three, and always sends at least one row', () => {
    const long = (n: number) => row(`p${n}`, `${'X'.repeat(30)} ${String(n).padStart(3, 'Z')}`, -100)
    const { batches } = categoriseBatches(input({ rows: Array.from({ length: 40 }, (_, n) => long(n)), tokenBudget: 400 }))
    for (const b of batches) expect(Math.ceil(new TextEncoder().encode(JSON.stringify(b.brief)).length / 3)).toBeLessThanOrEqual(400)
    expect(batches.length).toBeGreaterThan(1)
    const tight = categoriseBatches(input({ tokenBudget: 1 }))
    expect(tight.batches.map((b) => b.brief.rows.length)).toEqual([1, 1, 1])
  })

  it('offers at most 200 categories, and none when there is none to offer', () => {
    const lots = Array.from({ length: 201 }, (_, n) => ({ id: `k${n}`, name: `List ${n}`, kind: 'variable' as const }))
    expect(categoriseBatches(input({ categories: lots })).batches[0]!.brief.categories).toHaveLength(200)
    expect(categoriseBatches(input({ categories: [CATEGORIES[1]!] })).batches).toEqual([])
    const long = { id: 'k', name: 'Household things for the cabin 12345678 and more', kind: 'variable' as const }
    expect(categoriseBatches(input({ categories: [long] })).batches[0]!.brief.categories[0]!.name).toBe('Household things for the cabin # and mor')
  })
})

describe('suggestionsOf', () => {
  it('turns kept picks into one proposal per row, by category id', () => {
    const { batches } = categoriseBatches(input({ rows: [row('p1', 'LITWARE COFFEE', -450), row('p2', 'LITWARE COFFEE', -525), row('p3', 'ADVENTURE WORKS', 210_000)] }))
    const picks = [{ i: 1, alias: 'c1', confidence: 'high' as const }, { i: 2, alias: 'c2', confidence: 'medium' as const }]
    expect(suggestionsOf({ batch: batches[0]!, picks })).toEqual([
      { candidate: 'p1', category: 'groceries' },
      { candidate: 'p2', category: 'groceries' },
      { candidate: 'p3', category: 'pay' },
    ])
  })

  it('leaves out a pick for a row or an alias the batch does not have', () => {
    const { batches } = categoriseBatches(input())
    expect(suggestionsOf({ batch: batches[0]!, picks: [{ i: 9, alias: 'c1', confidence: 'high' }, { i: 1, alias: 'c7', confidence: 'high' }] })).toEqual([])
  })
})
