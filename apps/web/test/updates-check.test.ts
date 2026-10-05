import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_FILE, HELPER_FILE, OAUTH_SERVER, READ_RECEIPT_FILE, SERVER_FILE, SIGNING_KEY, SIGNUPS_OFF, UPDATES, checkUpdates, nextStep, type Checked } from '../src/help/updates.js'
import { MCP_SERVER_VERSION, READ_RECEIPT_VERSION } from '@budget/schema'
import { PUBLIC_KEY, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

const stateOf = (checked: readonly Checked[], prefix: string) => checked.find((c) => c.update.file.startsWith(prefix))?.state
const missing = (checked: readonly Checked[]) => checked.filter((c) => c.state !== 'in').map((c) => [c.update.file.slice(0, 4), c.state])

/** Every step done: signed in with Supabase's new key, sign-in for AI apps on, and the browser's own fetch reaching the fake. */
async function ready(seed: Parameters<typeof createFakeSupabase>[0] = {}, alg = 'ES256'): Promise<FakeSupabase> {
  const fake = createFakeSupabase(seed)
  await fake.signIn(alg)
  fake.oauth.grants = []
  vi.stubGlobal('fetch', fake.fetch)
  // The public values the page is built with, which the sign-ups check sends.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', PUBLIC_KEY)
  return fake
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('checking the one-time updates', () => {
  it('finds each one in when everything it adds answers', async () => {
    const fake = await ready()
    const checked = await checkUpdates(fake.client)
    expect(checked.map((c) => c.update.file.slice(0, 4))).toEqual(['sign', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0019', '0020', '0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0035', '0030', '0031', '0032', '0033', '0034', '0036', '0037', '0038', '0039', 'ai-f', 'read', 'sign', 'oaut', 'mcp-'])
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

  // The AI-app security updates (0030 on) change only functions, so each is
  // proven by the last one in: ai_app_updates_in() (0035) at or above its number.
  it('reads which AI-app updates are in: each one in at its number, offered in order, only once 0020 and 0035 are in', async () => {
    const levels = UPDATES.filter((u) => u.checks.some((c) => c.kind === 'level')).map((u) => u.file)
    expect(levels.map((f) => f.slice(0, 4))).toEqual(['0030', '0031', '0032', '0033', '0034', '0036', '0037', '0039'])
    const fake = await ready()
    const all = (state: string) => levels.map((f) => [f.slice(0, 4), state])
    fake.rpcReplies['ai_app_updates_in'] = 'thirty'
    expect(missing(await checkUpdates(fake.client))).toEqual(all('unknown'))
    for (const [at, file] of levels.entries()) {
      // The last one in is the one before: everything from this one on is missing, and this one is next.
      fake.rpcReplies['ai_app_updates_in'] = Number(levels[at - 1]?.slice(0, 4) ?? 29)
      const checked = await checkUpdates(fake.client)
      expect(missing(checked)).toEqual(all('missing').slice(at))
      expect(nextStep(checked)).toEqual({ kind: 'paste', file, fromStart: false })
    }
    // What 0035 reads wins over the number an earlier update pasted again set back.
    fake.rpcReplies['ai_app_updates_in'] = 39
    fake.rpcReplies['ai_app_update_level'] = 30
    expect(missing(await checkUpdates(fake.client))).toEqual([])
    fake.fail('ai_app_access', 'PGRST205')
    delete fake.rpcReplies['ai_app_updates_in']
    delete fake.rpcReplies['ai_app_update_level']
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0020_ai_apps.sql', fromStart: false })
  })

  // The review fixes change rules, not what the owner's session can see, so
  // each is proven by schema_level() (0021) at or above its number.
  it('reads which review fixes are in from schema_level: 0021 to 0029 in order after 0020, and 0038 last', async () => {
    const fake = await ready()
    const fixes = UPDATES.filter((u) => u.checks.some((c) => c.kind === 'schema')).map((u) => u.file.slice(0, 4))
    expect(fixes).toEqual(['0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0038'])
    fake.rpcReplies['schema_level'] = 24
    let checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual(['0025', '0026', '0027', '0028', '0029', '0038'].map((n) => [n, 'missing']))
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0025_ingested_text_format_characters.sql', fromStart: false })
    // With 0029 in, 0038 is offered only once the AI-app updates before it are in.
    fake.rpcReplies['schema_level'] = 29
    fake.rpcReplies['ai_app_updates_in'] = 36
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0037_ai_rows_before_the_fixes.sql', fromStart: false })
    fake.rpcReplies['ai_app_updates_in'] = 37
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0038_intuit_prefix_merchants.sql', fromStart: false })
    // 0039 is an AI-app update, read by its own level after 0038.
    fake.rpcReplies['schema_level'] = 38
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0039_ai_apps_suggest_changes.sql', fromStart: false })
    fake.rpcReplies['ai_app_updates_in'] = 39
    // Before 0021, schema_level is not there: every fix is missing, and 0021 is next.
    delete fake.rpcReplies['schema_level']
    checked = await checkUpdates(fake.client)
    expect(missing(checked).map(([n]) => n)).toEqual(fixes)
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0021_category_holds.sql', fromStart: false })
    fake.rpcReplies['schema_level'] = 'thirty'
    expect(missing(await checkUpdates(fake.client))).toEqual(fixes.map((n) => [n, 'unknown']))
  })

  // Before 0035, the number each of 0030 to 0034 left; 0035 is offered first, straight after 0020.
  it('before 0035, reads the level each update left, and offers 0035 next', async () => {
    const fake = await ready()
    delete fake.rpcReplies['ai_app_updates_in']
    fake.rpcReplies['ai_app_update_level'] = 31
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['0035', 'missing'], ['0032', 'missing'], ['0033', 'missing'], ['0034', 'missing'], ['0036', 'missing'], ['0037', 'missing'], ['0039', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0035_ai_app_updates_in.sql', fromStart: false })
    delete fake.rpcReplies['ai_app_update_level']
    expect(missing(await checkUpdates(fake.client)).map(([n]) => n)).toEqual(['0035', '0030', '0031', '0032', '0033', '0034', '0036', '0037', '0039'])
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

  // Security review mcp-3-03: an older read-receipt relies on the gateway's switch alone.
  it('reads read-receipt: deleted or its new version in, an older copy (405 to GET) old and next after the helper', async () => {
    const fake = await ready()
    expect(stateOf(await checkUpdates(fake.client), 'read-receipt')).toBe('in')
    fake.functions.readReceipt = () => new Response('{}')
    for (const [reply, state] of [
      [() => new Response(JSON.stringify({ ok: true, version: READ_RECEIPT_VERSION }), { headers: { 'content-type': 'application/json' } }), 'in'],
      [() => new Response(JSON.stringify({ ok: true, version: '2026-09-30.9' }), { headers: { 'content-type': 'application/json' } }), 'old'],
      [() => new Response(JSON.stringify({ ok: false, code: 'method_not_allowed' }), { status: 405, headers: { 'content-type': 'application/json' } }), 'old'],
      [() => new Response('{}', { status: 503 }), 'unknown'],
    ] as const) {
      fake.functions.readReceiptVersion = reply
      expect(stateOf(await checkUpdates(fake.client), 'read-receipt')).toBe(state)
    }
    fake.functions.readReceiptVersion = () => new Response(JSON.stringify({ ok: false }), { status: 405 })
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: READ_RECEIPT_FILE, fromStart: false })
    fake.functions.ai = null
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
  })

  it('asks for the helper’s new version when an older copy answers, and not for the same or a newer one', async () => {
    const fake = await ready()
    for (const [version, state] of [
      ['2026-09-25.5', 'old'], ['2026-09-24.9', 'old'], [undefined, 'old'], ['preview', 'old'],
      // 2026-09-27.5 is the copy from before AI apps, which let them spend the owner's keys (ADR 0012).
      ['2026-09-27.5', 'old'], ['2026-09-27.10', 'old'], ['2026-09-30.1', 'old'], ['2026-09-30.10', 'old'],
      // 2026-10-01.1 asks the auth server with the new publishable key (backend-b-04);
      // 2026-10-01.2 bounds every wait, body and all (backend-b-05); 2026-10-01.3 can serve the owner alone (backend-b-06);
      // 2026-10-01.4 keeps a good reply when noting it failed (backend-b-07);
      // 2026-10-01.5 counts the database calls around an attempt in its deadline (review-r-01).
      ['2026-10-01.1', 'old'], ['2026-10-01.3', 'old'], ['2026-10-01.4', 'old'], ['2026-10-01.5', 'in'], ['2026-10-01.10', 'in'], ['2026-10-02.1', 'in'],
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

  it('reads Allow new users to sign up from the auth server’s settings, first of all (backend-b-06)', async () => {
    const fake = await ready()
    fake.server.signupsOff = false
    const checked = await checkUpdates(fake.client)
    expect(checked[0]?.update.file).toBe(SIGNUPS_OFF)
    expect(missing(checked)).toEqual([['sign', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: SIGNUPS_OFF, fromStart: false })
    // Before anything else: with 0008 missing too, sign-ups is still the next step.
    fake.fail('category_budgets', 'PGRST205')
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: SIGNUPS_OFF, fromStart: false })
    fake.heal('category_budgets')
    fake.server.signupsOff = true
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'done' })
    // A refused key, an answer without the setting, no reply, or no public key: could not check, never "missing".
    for (const reply of [
      () => Promise.resolve(new Response('{"message":"No API key found in request"}', { status: 401 })),
      () => Promise.resolve(new Response('{"external":{}}', { status: 200 })),
      () => Promise.reject(new TypeError('Failed to fetch')),
    ]) {
      vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith('/auth/v1/settings') ? reply() : fake.fetch(input, init)))
      expect(stateOf(await checkUpdates(fake.client), SIGNUPS_OFF)).toBe('unknown')
    }
    vi.stubGlobal('fetch', fake.fetch)
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    expect(stateOf(await checkUpdates(fake.client), SIGNUPS_OFF)).toBe('unknown')
  })

  it('reads sign-in for AI apps from Supabase’s published settings, asking with nothing of the owner’s', async () => {
    const fake = await ready()
    const asked: unknown[] = []
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (asked.push([String(input), init]), fake.fetch(input, init)))
    fake.oauth.grants = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['oaut', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: OAUTH_SERVER, fromStart: false })
    expect(asked).toEqual([
      // Sign-ups, asked with the page's public key alone.
      ['http://fake.supabase.test/auth/v1/settings', { headers: { apikey: PUBLIC_KEY } }],
      ['http://fake.supabase.test/.well-known/oauth-authorization-server/auth/v1', undefined],
    ])
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
    // Only Supabase's own "switched off" is missing: another 404, any other failure, or no answer, could not be checked.
    const gateway404 = () => Promise.resolve(new Response(JSON.stringify({ message: 'no Route matched with those values' }), { status: 404 }))
    const busy = () => Promise.resolve(new Response(JSON.stringify({ message: 'upstream unavailable' }), { status: 503 }))
    for (const reply of [gateway404, busy, () => Promise.resolve(new Response('Not Found', { status: 404 })), () => Promise.reject(new TypeError('Failed to fetch'))]) {
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
      // Each reads a number and nothing else: schema_level for 0021 to 0029,
      // ai_app_updates_in for 0035 and then each of 0030 to 0034, 0036 and
      // 0037, schema_level again for 0038, and ai_app_updates_in for 0039.
      ...Array.from({ length: 9 }, () => ({ name: 'schema_level', args: {} })),
      ...Array.from({ length: 8 }, () => ({ name: 'ai_app_updates_in', args: {} })),
      { name: 'schema_level', args: {} },
      { name: 'ai_app_updates_in', args: {} },
    ])
    // The helper is only pinged.
    expect(fake.functions.calls).toEqual([{ action: 'ping' }])
    expect(UPDATES.every((u) => u.adds.trim() !== '')).toBe(true)
  })
})
