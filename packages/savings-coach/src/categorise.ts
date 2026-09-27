/**
 * Review's suggested categories: which rows the AI is asked about, and how
 * its picks become proposals (F46, docs/formula-decisions.md; plan §3.6,
 * A21; ADR 0008).
 *
 * The brief carries no amount, date or id. A row goes as a number, its
 * shop's name masked and cut (maskLabel), spent or received and a size
 * band from core; a category as an alias, c1 to c200, with its name and
 * list. Not spending is never offered, since 0018 refuses a proposal onto
 * it. The aliases and row numbers are translated back here, so an alias
 * the batch did not offer can never become a category id.
 */
import { sizeBand } from '@budget/core'
import type { CategoriseBrief, CategoriseCategory, CategorisePick } from '@budget/schema'
import { maskLabel } from './payload.js'

export interface CategoriseInput {
  /** Rows waiting in Review: `merchant` is the tidied name a learned rule matches on. */
  readonly rows: readonly { readonly id: string; readonly merchant: string; readonly amountCents: number; readonly categoryId: string | null }[]
  readonly categories: readonly { readonly id: string; readonly name: string; readonly kind: CategoriseCategory['list'] | 'transfer' }[]
  /** Shops with a learned rule: the owner has already filed them. */
  readonly learned: ReadonlySet<string>
  /** About how many tokens one request's data may take; 2,500 unless a test says otherwise. */
  readonly tokenBudget?: number
}

export interface CategoriseBatch {
  readonly brief: CategoriseBrief
  /** Each row number's candidates: every row sharing its shop, direction and band. */
  readonly rows: Readonly<Record<number, readonly string[]>>
  /** Each alias's category id. */
  readonly aliases: Readonly<Record<string, string>>
}

const MAX_ROWS = 40
const MAX_CATEGORIES = 200
const TOKEN_BUDGET = 2_500

/** The helper's own estimate: a request's UTF-8 bytes over three, rounded up. */
const tokensOf = (value: unknown): number => Math.ceil(new TextEncoder().encode(JSON.stringify(value)).length / 3)

export function categoriseBatches(input: CategoriseInput): { readonly batches: readonly CategoriseBatch[] } {
  const offered = input.categories.flatMap((c) => (c.kind === 'transfer' ? [] : [{ id: c.id, name: maskLabel(c.name), list: c.kind }])).slice(0, MAX_CATEGORIES)
  const categories = offered.map((c, n) => ({ alias: `c${n + 1}`, name: c.name, list: c.list }))
  const aliases = Object.fromEntries(offered.map((c, n) => [`c${n + 1}`, c.id]))
  if (categories.length === 0) return { batches: [] }

  // One question per shop, direction and band, in the order the rows came.
  const groups = new Map<string, { shop: string; flow: 'spent' | 'received'; size: 'small' | 'medium' | 'large'; ids: string[] }>()
  for (const r of input.rows) {
    if (r.categoryId !== null || input.learned.has(r.merchant)) continue
    const { flow, size } = sizeBand({ amountCents: r.amountCents })
    const key = JSON.stringify([r.merchant, flow, size])
    const group = groups.get(key)
    if (group === undefined) groups.set(key, { shop: maskLabel(r.merchant), flow, size, ids: [r.id] })
    else group.ids.push(r.id)
  }

  const budget = input.tokenBudget ?? TOKEN_BUDGET
  const batches: CategoriseBatch[] = []
  let rows: CategoriseBrief['rows'][number][] = []
  let ids: Record<number, readonly string[]> = {}
  const close = () => {
    if (rows.length > 0) batches.push({ brief: { rows, categories }, rows: ids, aliases })
    rows = []
    ids = {}
  }
  for (const g of groups.values()) {
    let next = { i: rows.length + 1, shop: g.shop, flow: g.flow, size: g.size }
    if (rows.length > 0 && (rows.length === MAX_ROWS || tokensOf({ rows: [...rows, next], categories }) > budget)) {
      close()
      next = { ...next, i: 1 }
    }
    rows.push(next)
    ids[next.i] = g.ids
  }
  close()
  return { batches }
}

/** Kept picks as proposals for 0018: every candidate its row stands for, in the picked category. */
export function suggestionsOf(input: { readonly batch: CategoriseBatch; readonly picks: readonly CategorisePick[] }): readonly { readonly candidate: string; readonly category: string }[] {
  return input.picks.flatMap((p) => {
    const category = input.batch.aliases[p.alias]
    const candidates = input.batch.rows[p.i]
    return category === undefined || candidates === undefined ? [] : candidates.map((candidate) => ({ candidate, category }))
  })
}
