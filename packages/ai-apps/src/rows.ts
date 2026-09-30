/**
 * The database's rows, renamed for the engine exactly as the app renames
 * them (PLAN §2.4, "the same figure as the screen"): the casts of
 * `apps/web/src/ledger.ts`, tested against it in
 * `apps/web/test/ai-apps-parity.test.ts`. Rows are cast, not parsed:
 * database rows are not one of CLAUDE.md's four zod boundaries. A part
 * that is not a list is unreadable.
 */
import type { CategoryKind } from '@budget/schema'

/** A category as `listCategories` gives it to the app's screens. */
export interface CategoryRow {
  readonly id: string
  readonly name: string
  readonly kind: CategoryKind
  readonly sort_order: number
  readonly weekly_budget_cents: number | null
}

export class UnreadableRows extends RangeError {}

function listOf(part: unknown): readonly unknown[] {
  if (!Array.isArray(part)) throw new UnreadableRows('a part of the read was not a list')
  return part
}

export function categoriesFrom(part: unknown): CategoryRow[] {
  return (listOf(part) as readonly CategoryRow[]).map((c) => ({
    ...c,
    sort_order: Number(c.sort_order),
    weekly_budget_cents: c.weekly_budget_cents === null ? null : Number(c.weekly_budget_cents),
  }))
}
