import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_FILE, HELPER_FILE, OAUTH_SERVER, SERVER_FILE, SIGNING_KEY, UPDATES, checkUpdates, nextStep, type Checked } from '../src/help/updates.js'
import { MCP_SERVER_VERSION } from '@budget/schema'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

const stateOf = (checked: readonly Checked[], prefix: string) => checked.find((c) => c.update.file.startsWith(prefix))?.state
const missing = (checked: readonly Checked[]) => checked.filter((c) => c.state !== 'in').map((c) => [c.update.file.slice(0, 4), c.state])

/** Every step done: signed in with Supabase's new key, sign-in for AI apps on, and the browser's own fetch reaching the fake. */
async function ready(seed: Parameters<typeof createFakeSupabase>[0] = {}, alg = 'ES256'): Promise<FakeSupabase> {
  const fake = createFakeSupabase(seed)
  await fake.signIn(alg)
  fake.oauth.grants = []
  vi.stubGlobal('fetch', fake.fetch)
  return fake
}

afterEach(() => vi.unstubAllGlobals())

describe('checking the one-time updates', () => {
  it('finds each one in when everything it adds answers', async () => {
    const fake = await ready()
    const checked = await checkUpdates(fake.client)
    expect(checked.map((c) => c.update.file.slice(0, 4))).toEqual(['0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', 'ai-f', 'sign', 'oaut', 'mcp-'])
    expect(missing(checked)).toEqual([])
    expect(nextStep(checked)).toEqual({ kind: 'done' })
  })

  it('reads PGRST205, and 42P01 from an older server, as a table not there', async () => {
    const fake = await ready()
    fake.fail('category_budgets', 'PGRST205')
    fake.fail('debt_extra_payments', '42P01')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0008', 'missing'], ['0014', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0008_category_budgets.sql', fromStart: false })
  })

  it('reads PGRST202, and 42883 from Postgres, as a function not there', async () => {
    const fake = await ready()
    delete fake.rpcReplies['recategorise_transaction']
    fake.fail('rpc/dismiss_unreadable_line', '42883')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0006', 'missing'], ['0012', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0006_recategorise.sql', fromStart: false })
  })

  it('reads 42703 as a column not there, and with 0005 missing starts at HANDOFF’s first file', async () => {
    const fake = await ready()
    fake.server.refuse = (table, query) => (table === 'categories' && query.get('select') === 'kind' ? '42703' : null)
    const checked = await checkUpdates(fake.client)
    expect(stateOf(checked, '0005')).toBe('missing')
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: FIRST_FILE, fromStart: true })
  })

  // G1's update adds columns to a table that is already there, so it is
  // proven by reading one of them, as 0013's is.
  it('reads 42703 on a goal’s place as 0015 not in yet, after everything before it', async () => {
    const fake = await ready()
    fake.server.refuse = (table, query) => (table === 'savings_goals' && query.get('select') === 'sort_order' ? '42703' : null)
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0015', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0015_savings_goals_order.sql', fromStart: false })
  })

  it('reads PGRST202 on ai_key_status as 0016 not in yet, and names it before the AI helper', async () => {
    const fake = await ready()
    delete fake.rpcReplies['ai_key_status']
    fake.functions.ai = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0016', 'missing'], ['ai-f', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0016_ai_foundation.sql', fromStart: false })
  })

  // A12's update adds three tables; any one missing means it is not in.
  it('reads PGRST205 on the Coach’s notes as 0017 not in yet, before the AI helper', async () => {
    const fake = await ready()
    fake.fail('coach_answers', 'PGRST205')
    fake.functions.ai = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0017', 'missing'], ['ai-f', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0017_coach_memory.sql', fromStart: false })
  })

  // A21's update adds two functions; clearing a suggestion proves it without changing a row.
  it('reads PGRST202 on clearing a suggestion as 0018 not in yet', async () => {
    const fake = await ready()
    delete fake.rpcReplies['clear_candidate_suggestion']
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0018', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0018_category_suggestions.sql', fromStart: false })
    expect(fake.rpcCalls.filter((c) => c.name === 'clear_candidate_suggestion')).toEqual([
      { name: 'clear_candidate_suggestion', args: { p_candidate: '00000000-0000-0000-0000-000000000000' } },
    ])
  })

  // AI apps cannot write: 0019 re-creates 0018's functions, so it comes only after 0018.
  it('reads PGRST202 on the AI-app guard as 0019 not in yet, offered only once 0018 is in', async () => {
    const fake = await ready()
    delete fake.rpcReplies['_not_an_ai_app']
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0019', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0019_ai_apps_cannot_write.sql', fromStart: false })
    delete fake.rpcReplies['clear_candidate_suggestion']
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0018_category_suggestions.sql', fromStart: false })
  })

  // What AI apps may do: 0020 uses 0019's label and guard, so it comes only after 0019.
  it('reads PGRST205 on the AI apps switch as 0020 not in yet, offered only once 0019 is in', async () => {
    const fake = await ready()
    fake.fail('ai_app_access', 'PGRST205')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0020', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0020_ai_apps.sql', fromStart: false })
    delete fake.rpcReplies['_not_an_ai_app']
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0019_ai_apps_cannot_write.sql', fromStart: false })
  })

  it('reads Supabase’s 404 for the AI helper as not installed, and any other failure as could not check', async () => {
    const fake = await ready()
    fake.functions.ai = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['ai-f', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
    fake.functions.ai = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(missing(await checkUpdates(fake.client))).toEqual([['ai-f', 'unknown']])
  })

  it('asks for the helper’s new version when an older copy answers, and not for the same or a newer one', async () => {
    const fake = await ready()
    for (const [version, state] of [
      ['2026-09-25.5', 'old'], ['2026-09-24.9', 'old'], [undefined, 'old'], ['preview', 'old'],
      // 2026-09-27.5 is the copy from before AI apps, which let them spend the owner's keys (ADR 0012).
      ['2026-09-27.5', 'old'], ['2026-09-27.10', 'old'], ['2026-09-30.1', 'in'], ['2026-09-30.10', 'in'], ['2026-10-01.1', 'in'],
    ] as const) {
      fake.functions.ai = () => new Response(JSON.stringify({ ok: true, version }), { headers: { 'content-type': 'application/json' } })
      const checked = await checkUpdates(fake.client)
      expect([version, missing(checked)]).toEqual([version, state === 'old' ? [['ai-f', 'old']] : []])
      if (state === 'old') expect(nextStep(checked)).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
    }
  })

  // The AI apps server (ADR 0012) answers /mcp/health; it comes last, after the helper.
  it('reads the AI apps server’s health: 404 not installed, an older version old, anything else could not check', async () => {
    const fake = await ready()
    fake.functions.mcpHealth = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['mcp-', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: SERVER_FILE, fromStart: false })
    const says = (version: unknown) => () => new Response(JSON.stringify({ ok: true, version, tools: 0 }), { headers: { 'content-type': 'application/json' } })
    // Relative to MCP_SERVER_VERSION, so a bump does not break this case.
    const [day, n] = MCP_SERVER_VERSION.split('.') as [string, string]
    for (const [version, state] of [[`${day}.${Number(n) - 1}`, 'old'], ['2020-01-01.9', 'old'], [undefined, 'old'], [MCP_SERVER_VERSION, 'in'], [`${day}.${Number(n) + 1}`, 'in'], ['2999-01-01.1', 'in']] as const) {
      fake.functions.mcpHealth = says(version)
      expect([version, missing(await checkUpdates(fake.client))]).toEqual([version, state === 'old' ? [['mcp-', 'old']] : []])
    }
    fake.functions.mcpHealth = () => new Response('{}', { status: 401 })
    expect(missing(await checkUpdates(fake.client))).toEqual([['mcp-', 'unknown']])
    fake.functions.ai = null
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
  })

  // ChatGPT asks for an ID token, which Supabase issues only when it signs with an asymmetric key (PLAN §2.3).
  it('reads the key from the owner’s own token: ES256 or RS256 in, the old shared secret next after the AI helper', async () => {
    for (const [alg, state] of [['ES256', 'in'], ['RS256', 'in'], ['HS256', 'missing'], ['none', 'unknown']] as const) {
      const fake = await ready({}, alg)
      expect([alg, stateOf(await checkUpdates(fake.client), 'signing')]).toEqual([alg, state])
    }
    const fake = await ready({}, 'HS256')
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: SIGNING_KEY, fromStart: false })
    fake.functions.ai = null
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
    // With no session there is no token to read.
    const signedOut = createFakeSupabase()
    vi.stubGlobal('fetch', signedOut.fetch)
    expect(stateOf(await checkUpdates(signedOut.client), 'signing')).toBe('unknown')
  })

  it('reads sign-in for AI apps from Supabase’s published settings, asking with nothing of the owner’s', async () => {
    const fake = await ready()
    const asked: unknown[] = []
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (asked.push([String(input), init]), fake.fetch(input, init)))
    fake.oauth.grants = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['oaut', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: OAUTH_SERVER, fromStart: false })
    expect(asked).toEqual([['http://fake.supabase.test/.well-known/oauth-authorization-server/auth/v1', undefined]])
    fake.oauth.grants = []
    for (const [metadata, state] of [
      // On, but apps cannot register themselves, or without the S256 ChatGPT requires: the same step's switch.
      [{ code_challenge_methods_supported: ['S256'] }, 'missing'],
      [{ registration_endpoint: 'https://x.test/register', code_challenge_methods_supported: ['plain'] }, 'missing'],
      [{ registration_endpoint: 'https://x.test/register', code_challenge_methods_supported: ['S256'] }, 'in'],
    ] as const) {
      fake.oauth.metadata = metadata
      expect([metadata, stateOf(await checkUpdates(fake.client), 'oauth')]).toEqual([metadata, state])
    }
    // Only Supabase's own "switched off" is missing: another 404, or no answer, could not be checked.
    const gateway404 = () => Promise.resolve(new Response(JSON.stringify({ message: 'no Route matched with those values' }), { status: 404 }))
    for (const reply of [gateway404, () => Promise.resolve(new Response('Not Found', { status: 404 })), () => Promise.reject(new TypeError('Failed to fetch'))]) {
      vi.stubGlobal('fetch', reply)
      expect(stateOf(await checkUpdates(fake.client), 'oauth')).toBe('unknown')
    }
  })

  it('says it could not check, never "missing", when the answer is something else', async () => {
    const fake = await ready()
    fake.fail('month_balances', 'PGRST301')
    fake.fail('rpc/recategorise_transaction', '')
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0006', 'unknown'], ['0010', 'unknown']])
    expect(nextStep(checked)).toEqual({ kind: 'unknown' })
  })

  it('names the first missing one even when another could not be checked', async () => {
    const fake = await ready()
    fake.fail('month_balances', 'PGRST301')
    fake.fail('pay_schedules', 'PGRST205')
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0011_pay_schedules.sql', fromStart: false })
  })

  it('changes nothing: tables are read for no rows, functions sent the nil id', async () => {
    const fake = await ready({
      transactions: [{ id: 't1', posted_on: '2026-09-02', amount_cents: -100, merchant_raw: 'SHOP', category_id: 'c1', source: 'manual' }],
    })
    const before = JSON.stringify(fake.tables)
    await checkUpdates(fake.client)
    expect(JSON.stringify(fake.tables)).toBe(before)
    const nil = '00000000-0000-0000-0000-000000000000'
    expect(fake.rpcCalls).toEqual([
      { name: 'recategorise_transaction', args: { p_transaction: nil, p_category: nil, p_learn: false } },
      { name: 'dismiss_unreadable_line', args: { p_line: nil } },
      { name: 'ai_key_status', args: {} },
      { name: 'clear_candidate_suggestion', args: { p_candidate: nil } },
      { name: '_not_an_ai_app', args: {} },
    ])
    // The helper is only pinged.
    expect(fake.functions.calls).toEqual([{ action: 'ping' }])
    expect(UPDATES.every((u) => u.adds.trim() !== '')).toBe(true)
  })
})
