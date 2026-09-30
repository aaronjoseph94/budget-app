import { describe, expect, it } from 'vitest'
import { categoriesFrom } from '@budget/ai-apps/rows'
import { listCategories, type Category } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * The AI apps server renames the database's rows for the engine exactly as
 * the app does (MCP PLAN §2.4), so a chat cannot quote a figure the screen
 * does not show. Each case gives both the same rows, in the order the
 * database returns them, and requires the same result.
 */
describe('the AI apps server reads rows as the app does', () => {
  it('categories', async () => {
    // By sort order, then name, as ai_app_read and the app's read both order them.
    const rows: Category[] = [
      { id: 'c2', name: 'Groceries', kind: 'variable', sort_order: 0, weekly_budget_cents: 15000 },
      { id: 'c1', name: 'Pay', kind: 'income', sort_order: 0, weekly_budget_cents: null },
      { id: 'c3', name: 'Snacks', kind: 'variable', sort_order: 0, weekly_budget_cents: 0 },
      { id: 'c4', name: 'Rent', kind: 'bill', sort_order: 2, weekly_budget_cents: null },
    ]
    const app = await listCategories(createFakeSupabase({ categories: rows }).client)
    expect(categoriesFrom(JSON.parse(JSON.stringify(rows)))).toEqual(app)
    expect(app).toHaveLength(4)
  })
})
