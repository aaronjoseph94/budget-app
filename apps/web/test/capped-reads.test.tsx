import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { AppDataProvider } from '../src/app-data.js'
import { readAnswers } from '../src/coach/answers.js'
import { useDismissals } from '../src/coach/dismissals.js'
import { listRules } from '../src/ledger.js'
import { listLearnedShops } from '../src/learned-shops.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * Supabase answers at most 1,000 rows a request (PostgREST's max-rows). Four
 * reads asked once and silently stopped there, among them the only list that
 * can revoke a shop that files itself (architecture-c1-03). Each now reads
 * page by page, as readAll does for the ledger. The cap here is 2 rows.
 */
afterEach(cleanup)

const pad = (n: number) => String(n).padStart(4, '0')
function capped() {
  const fake = createFakeSupabase()
  for (let n = 0; n < 5; n++) {
    fake.tables.merchant_rules.push({ id: `r${pad(n)}`, match_merchant: `SHOP ${pad(n)}`, category_id: 'c1' })
    fake.tables.coach_answers.push({ user_id: 'u1', transaction_id: `t${pad(n)}`, answer: 'planned', asked_week: '2026-09-21' })
    fake.tables.insight_dismissals.push({ user_id: 'u1', insight_key: `k${pad(n)}` })
  }
  fake.server.maxRows = 2
  return fake
}

describe('reads past the server’s row cap', () => {
  it('lists every learned shop, the last one included', async () => {
    const shops = await listLearnedShops(capped().client)
    expect(shops.map((s) => s.merchant)).toEqual(['SHOP 0000', 'SHOP 0001', 'SHOP 0002', 'SHOP 0003', 'SHOP 0004'])
  })

  it('gives Just type it every rule', async () => {
    expect((await listRules(capped().client)).size).toBe(5)
  })

  it('reads every check-in answer', async () => {
    const read = await readAnswers(capped().client)
    expect(read.status === 'ready' ? read.rows.length : read.status).toBe(5)
  })

  it('reads every dismissed insight', async () => {
    const fake = capped()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AppDataProvider supabase={fake.client} userId="u1" email="you@example.com">{children}</AppDataProvider>
    )
    const { result } = renderHook(() => useDismissals(), { wrapper })
    await waitFor(() => expect(result.current.dismissed?.size).toBe(5))
  })
})
