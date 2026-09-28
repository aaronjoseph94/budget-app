import { describe, expect, it } from 'vitest'
import { getMonthBalance, setMonthBalance, type BalanceEdit } from '../src/ledger.js'
import { createFakeSupabase } from './fake-supabase.js'

/**
 * A month's starting balance is typed once a month (0010, decision 6), read
 * back for that month alone, and cleared by removing it, never by storing a
 * blank that could read as $0 (D17). The fake server upserts on 0010's key
 * and refuses what 0010 refuses.
 */

const typed = (month: string, startingBalanceCents: number | null): BalanceEdit => ({
  userId: 'u1', month, startingBalanceCents,
})
const stored = (fake: ReturnType<typeof createFakeSupabase>) =>
  fake.tables.month_balances.map((b) => [b.user_id, b.month, b.starting_balance_cents])

describe('setMonthBalance and getMonthBalance', () => {
  it('writes one row a month, replaced when typed over, and reads back that month alone', async () => {
    const fake = createFakeSupabase()
    await setMonthBalance(fake.client, typed('2026-09-01', 240_000))
    await setMonthBalance(fake.client, typed('2026-09-01', 245_050))
    // Overdrawn: kept with its sign.
    await setMonthBalance(fake.client, typed('2026-10-01', -2_500))
    expect(stored(fake)).toEqual([
      ['u1', '2026-09-01', 245_050],
      ['u1', '2026-10-01', -2_500],
    ])
    expect(await getMonthBalance(fake.client, '2026-09-01')).toBe(245_050)
    expect(await getMonthBalance(fake.client, '2026-10-01')).toBe(-2_500)
    // Never carried from the month before: November has none typed.
    expect(await getMonthBalance(fake.client, '2026-11-01')).toBeNull()
  })

  it('keeps a typed $0, and clears by removing the row, which then reads as none typed', async () => {
    const fake = createFakeSupabase()
    await setMonthBalance(fake.client, typed('2026-09-01', 0))
    expect(await getMonthBalance(fake.client, '2026-09-01')).toBe(0)
    await setMonthBalance(fake.client, typed('2026-10-01', 100))
    await setMonthBalance(fake.client, typed('2026-09-01', null))
    expect(stored(fake)).toEqual([['u1', '2026-10-01', 100]])
    expect(await getMonthBalance(fake.client, '2026-09-01')).toBeNull()
  })

  it('says in words why a balance could not be read or saved', async () => {
    const unapplied = createFakeSupabase()
    unapplied.fail('month_balances', 'PGRST205')
    await expect(getMonthBalance(unapplied.client, '2026-09-01')).rejects.toThrow(
      'Starting balances need a one-time update, so this month cannot be shown. (code PGRST205)',
    )
    await expect(setMonthBalance(unapplied.client, typed('2026-09-01', 100))).rejects.toThrow(
      'Starting balances need a one-time update. Nothing was saved. (code PGRST205)',
    )
    const offline = createFakeSupabase()
    offline.fail('month_balances', '')
    await expect(getMonthBalance(offline.client, '2026-09-01')).rejects.toThrow(
      'Could not reach the database to read your starting balance. Check your connection and try again.',
    )
    const refused = createFakeSupabase()
    refused.fail('month_balances', '42501')
    await expect(getMonthBalance(refused.client, '2026-09-01')).rejects.toThrow(
      'Your starting balance could not be read, so this month is not shown. Try again. (code 42501)',
    )
    await expect(setMonthBalance(refused.client, typed('2026-09-01', null))).rejects.toThrow(
      'Your sign-in does not allow this. Signing out and back in usually fixes it. (code 42501)',
    )
  })
})
