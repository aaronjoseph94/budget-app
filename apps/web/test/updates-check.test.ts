import { afterEach, describe, expect, it, vi } from 'vitest'
import { FIRST_FILE, HELPER_FILE, READ_RECEIPT_FILE, SIGNUPS_OFF, UPDATES, checkUpdates, nextStep, type Checked } from '../src/help/updates.js'
import { READ_RECEIPT_VERSION } from '@budget/schema'
import { PUBLIC_KEY, createFakeSupabase, type FakeSupabase } from './fake-supabase.js'

const stateOf = (checked: readonly Checked[], prefix: string) => checked.find((c) => c.update.file.startsWith(prefix))?.state
const missing = (checked: readonly Checked[]) => checked.filter((c) => c.state !== 'in').map((c) => [c.update.file.slice(0, 4), c.state])

/** Every step done: signed in, and the browser's own fetch reaching the fake. */
async function ready(seed: Parameters<typeof createFakeSupabase>[0] = {}): Promise<FakeSupabase> {
  const fake = createFakeSupabase(seed)
  await fake.signIn()
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
    expect(checked.map((c) => c.update.file.slice(0, 4))).toEqual(['sign', '0005', '0006', '0007', '0008', '0009', '0010', '0011', '0012', '0013', '0014', '0015', '0016', '0017', '0018', '0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0038', '0041', 'ai-f', 'read'])
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

  // The review fixes change rules, not what the owner's session can see, so
  // each is proven by schema_level() (0021) at or above its number.
  it('reads which review fixes are in from schema_level: 0021 to 0029 in order after 0018, then 0038 and 0041', async () => {
    const fake = await ready()
    const fixes = UPDATES.filter((u) => u.checks.some((c) => c.kind === 'schema')).map((u) => u.file.slice(0, 4))
    expect(fixes).toEqual(['0021', '0022', '0023', '0024', '0025', '0026', '0027', '0028', '0029', '0038', '0041'])
    fake.rpcReplies['schema_level'] = 24
    let checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual(['0025', '0026', '0027', '0028', '0029', '0038', '0041'].map((n) => [n, 'missing']))
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0025_ingested_text_format_characters.sql', fromStart: false })
    // With 0029 in, 0038 is next, then 0041, which moves schema_level() on from 38 (ADR 0015).
    fake.rpcReplies['schema_level'] = 29
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0038_intuit_prefix_merchants.sql', fromStart: false })
    fake.rpcReplies['schema_level'] = 38
    expect(nextStep(await checkUpdates(fake.client))).toEqual({ kind: 'paste', file: '0041_ai_free_order.sql', fromStart: false })
    fake.rpcReplies['schema_level'] = 41
    expect(missing(await checkUpdates(fake.client))).toEqual([])
    // Before 0021, schema_level is not there: every fix is missing, and 0021 is next.
    delete fake.rpcReplies['schema_level']
    checked = await checkUpdates(fake.client)
    expect(missing(checked).map(([n]) => n)).toEqual(fixes)
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: '0021_category_holds.sql', fromStart: false })
    fake.rpcReplies['schema_level'] = 'thirty'
    expect(missing(await checkUpdates(fake.client))).toEqual(fixes.map((n) => [n, 'unknown']))
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

  // An older read-receipt relies on the gateway's switch alone.
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
      // 2026-09-27.5 is a copy from before the helper refused a caller that is not the owner.
      ['2026-09-27.5', 'old'], ['2026-09-27.10', 'old'], ['2026-09-30.1', 'old'], ['2026-09-30.10', 'old'],
      // 2026-10-01.1 asks the auth server with the new publishable key (backend-b-04);
      // 2026-10-01.2 bounds every wait, body and all (backend-b-05); 2026-10-01.3 can serve the owner alone (backend-b-06);
      // 2026-10-01.4 keeps a good reply when noting it failed (backend-b-07);
      // 2026-10-01.5 counts the database calls around an attempt in its deadline (review-r-01);
      // 2026-10-08.1 names each service's models, reads a photo on OpenRouter and Groq, and tries the free services quick first (ADR 0015);
      // 2026-10-08.2 takes the speed test, a test run on one named service, and says how long the attempt took;
      // 2026-11-09.1 says it could not finish, not "AI isn't set up", when no time is left for a first attempt.
      ['2026-10-01.1', 'old'], ['2026-10-01.3', 'old'], ['2026-10-01.4', 'old'], ['2026-10-01.5', 'old'], ['2026-10-01.10', 'old'], ['2026-10-02.1', 'old'], ['2026-10-08.1', 'old'],
      ['2026-10-08.2', 'old'], ['2026-10-08.10', 'old'], ['2026-10-09.1', 'old'],
      ['2026-11-09.1', 'in'], ['2026-11-09.10', 'in'], ['2026-11-10.1', 'in'],
    ] as const) {
      fake.functions.ai = () => new Response(JSON.stringify({ ok: true, version }), { headers: { 'content-type': 'application/json' } })
      const checked = await checkUpdates(fake.client)
      expect([version, missing(checked)]).toEqual([version, state === 'old' ? [['ai-f', 'old']] : []])
      if (state === 'old') expect(nextStep(checked)).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
    }
  })

  // Safari, 2026-10-16: with the sign-in headers, a missing function's 404 cannot be read, and every function row said "?".
  it('in a browser, reads a function deleted or never deployed from a plain GET, which needs no preflight', async () => {
    const fake = await ready()
    fake.functions.inBrowser = true
    // read-receipt is deleted by default: that is in.
    expect(missing(await checkUpdates(fake.client))).toEqual([])
    fake.functions.ai = null
    const checked = await checkUpdates(fake.client)
    expect(missing(checked)).toEqual([['ai-f', 'missing']])
    expect(nextStep(checked)).toEqual({ kind: 'paste', file: HELPER_FILE, fromStart: false })
    // One still there is asked with the sign-in, as before: an older read-receipt is old.
    fake.functions.readReceipt = () => new Response('{}')
    fake.functions.readReceiptVersion = () => new Response(JSON.stringify({ ok: false }), { status: 405 })
    expect(stateOf(await checkUpdates(fake.client), 'read-receipt')).toBe('old')
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
      // Each of 0021 to 0029, 0038 and 0041 reads schema_level, a number and nothing else.
      ...Array.from({ length: 11 }, () => ({ name: 'schema_level', args: {} })),
    ])
    // The helper is only pinged.
    expect(fake.functions.calls).toEqual([{ action: 'ping' }])
    expect(UPDATES.every((u) => u.adds.trim() !== '')).toBe(true)
  })

  // The AI apps feature is gone (the owner does not use it): no step names it, and nothing asks the database about it.
  it('lists no step for AI apps, and asks for no AI-app function, table or server', async () => {
    expect(UPDATES.filter((u) => /ai[-_ ]?app|mcp|oauth|chatgpt|claude|signing/i.test(`${u.file} ${u.name ?? ''} ${u.adds}`))).toEqual([])
    const fake = await ready()
    const asked: string[] = []
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => (asked.push(String(input)), fake.fetch(input, init)))
    await checkUpdates(fake.client)
    expect(asked.filter((a) => /mcp|oauth|ai_app/i.test(a))).toEqual([])
    expect(fake.rpcCalls.filter((c) => /ai_app/.test(c.name))).toEqual([])
  })
})
