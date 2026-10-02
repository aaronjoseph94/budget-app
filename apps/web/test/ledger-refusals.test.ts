import { describe, expect, it } from 'vitest'
import { getMonthBalance, needsOneTimeUpdate, renameCategory, saveImport } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A refused write or single read keeps the database's code, in the same
 * sentence as before, so a screen can tell a one-time update not yet
 * pasted from anything else (architecture-b-05). Only readAll's refusals
 * kept it, so the Setup money steps said a missing 0010 as a plain failure
 * (N114).
 */
describe('a refused write or single read', () => {
  it('says a table an update adds is not there yet, and keeps its sentence', async () => {
    const fake = createFakeSupabase()
    fake.fail('month_balances', 'PGRST205')
    const cause = await getMonthBalance(fake.client, '2026-09-01').catch((e: unknown) => e)
    expect(needsOneTimeUpdate(cause)).toBe(true)
    expect(cause instanceof Error && cause.message.length > 0).toBe(true)
  })

  it('says a function an update adds is not there yet, for an import', async () => {
    const fake = createFakeSupabase()
    fake.fail('rpc/save_import', 'PGRST202')
    const cause = await saveImport(fake.client, { userId: 'u1', accountId: 'a1', source: 'card_csv', parsed: 0, accepted: [], rejected: [] }).catch((e: unknown) => e)
    expect(needsOneTimeUpdate(cause)).toBe(true)
  })

  it('does not call any other refusal a missing update', async () => {
    const fake = createFakeSupabase()
    fake.fail('PATCH categories', '23514')
    const cause = await renameCategory(fake.client, 'c1', 'x').catch((e: unknown) => e)
    expect(cause instanceof Error).toBe(true)
    expect(needsOneTimeUpdate(cause)).toBe(false)
  })
})
