import { describe, expect, it } from 'vitest'
import { SENTENCES } from '../src/rpc.js'
import { callTool, reply, type Rpc } from './fake-database.js'

/**
 * add_expense and add_note against a fake database (PLAN §2.13, mcp-add).
 * The server reads the owner's today and card account, hashes the words
 * exactly as given, and asks ai_app_add_candidate for one pending Review
 * row; SQL checks the hash again. The account, day, amount and words are
 * 0031's schema test's, so the hash must be the literal it checks SQL against.
 */
const $ = (cents: number, display: string) => ({ cents, display })
const ACCOUNT = 'aaaaaaaa-0000-4000-8000-000000000001'
// dedupe.ts's 'ai_app' kind (0031, mcp-2-01): never a statement row's hash.
const LUNCH_1 = '206b7b1e064cf1e59e31da82c407a14a697eb0448ad0ea59ba078cbd7de4795d'
const LUNCH_2 = '750ae64d42c96e628f602a05afe0d85ec04e2b2e93a42efc5e49c401e7332e76'

const OWNER = {
  today: '2026-09-30',
  account: ACCOUNT,
  categories: [
    { id: 'card', name: 'Card payments', kind: 'transfer', sort_order: 0, weekly_budget_cents: null },
    { id: 'out', name: 'Eating out​', kind: 'variable', sort_order: 1, weekly_budget_cents: 4000 },
  ],
}
const owner = (read: unknown, added: unknown = { status: 'added', waiting: '3' }): Rpc => (fn) => reply(fn === 'ai_app_read' ? read : added)
const add = (args: Record<string, unknown>, rpc: Rpc = owner(OWNER)) => callTool(rpc, 'add_expense', args)
const body = (call: { init: RequestInit } | undefined) => JSON.parse(String(call?.init.body)) as Record<string, unknown>
const LUNCH = { amount: '12.50', what: 'Lunch at Subway', date: '2026-09-29' }
const says = (text: string) => ({ isError: true, content: [{ type: 'text', text }] })

describe('add_expense', () => {
  it('reads the account, then adds one pending row with the hash SQL checks', async () => {
    const { result, rpcCalls } = await add(LUNCH)
    expect(rpcCalls.map((c) => c.url.replace(/.*\/rpc\//, ''))).toEqual(['ai_app_read', 'ai_app_add_candidate'])
    expect(body(rpcCalls[0])).toMatchObject({ p_parts: ['account'] })
    expect(body(rpcCalls[1])).toEqual({
      p_account: ACCOUNT,
      p_posted_on: '2026-09-29',
      p_amount_cents: -1250,
      p_words: 'Lunch at Subway',
      p_occurrence: 1,
      p_dedupe_hash: LUNCH_1,
      p_dedupe_hash_v: 1,
      p_category_name: null,
    })
    expect(result.structuredContent).toEqual({
      as_of: '2026-09-30',
      status: 'added',
      entry: { date: '2026-09-29', what: 'Lunch at Subway', amount: $(-1250, '-$12.50'), flow: 'spent', suggested_category: null },
      waiting_in_review: 3,
      message: 'Added to Review. It counts nowhere until the owner approves it in the app.',
    })
  })

  it('makes a second identical purchase that day its own row, and trims the words before hashing', async () => {
    const { rpcCalls } = await add({ ...LUNCH, what: '  Lunch at Subway ', same_again: 2 })
    expect(body(rpcCalls[1])).toMatchObject({ p_words: 'Lunch at Subway', p_occurrence: 2, p_dedupe_hash: LUNCH_2 })
  })

  it('stores the words as given, and hands them back cleaned as list_review_queue shows them', async () => {
    const { result, rpcCalls } = await add({ ...LUNCH, what: 'Lunch at Subway 1234567' })
    expect(body(rpcCalls[1])).toMatchObject({ p_words: 'Lunch at Subway 1234567' })
    expect(result.structuredContent).toMatchObject({ entry: { what: 'Lunch at Subway *******' } })
  })

  // mcp-2-05: two entries that look the same in Review must be the same words.
  it('refuses words with a character that draws as nothing, before reading anything', async () => {
    const { result, rpcCalls } = await add({ ...LUNCH, what: 'Lunch\u200b at Subway' })
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })

  it('takes money received as positive, today by default, and a category by the name list_categories gives', async () => {
    const { result, rpcCalls } = await add({ amount: '$1,000', what: 'Refund', flow: 'received', category: 'Eating out' })
    expect(body(rpcCalls[0])).toMatchObject({ p_parts: ['account', 'categories'] })
    // The stored name, hidden character and all: SQL matches names exactly.
    expect(body(rpcCalls[1])).toMatchObject({ p_posted_on: '2026-09-30', p_amount_cents: 100000, p_words: 'Refund', p_category_name: 'Eating out​' })
    expect(result.structuredContent).toMatchObject({ entry: { date: '2026-09-30', amount: $(100000, '$1,000.00'), flow: 'received', suggested_category: 'Eating out' } })
  })

  it.each([
    ['one the owner does not have', 'Groceries'],
    ['Not spending', 'Card payments'],
  ])('refuses a category that is %s, and adds nothing', async (_, category) => {
    const { result, rpcCalls } = await add({ ...LUNCH, category })
    expect(result).toEqual(says(SENTENCES.unknown_category))
    expect(rpcCalls).toHaveLength(1)
  })

  it.each([
    ['an amount sent as a number', { amount: 12.5 }],
    ['a zero amount', { amount: '0.00' }],
    ['an amount over $100,000.00', { amount: '100000.01' }],
    ['a control character in the words', { what: 'Lunch\u0007' }],
    ['a direction override in the words', { what: 'Lunch ‮yawbuS' }],
    ['no words', { what: '   ' }],
    ['more than 120 characters of words', { what: 'x'.repeat(121) }],
    ['same_again of 0', { same_again: 0 }],
    ['same_again of 10', { same_again: 10 }],
    ['a date that is not a date', { date: '2026-02-30' }],
  ])('refuses %s before reading anything', async (_, args) => {
    const { result, rpcCalls } = await add({ ...LUNCH, ...args })
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })

  // 0000-02-29, a leap day in year 0: zod and money-primitives' isoDate pass it, and no owner's past year holds it.
  it('refuses a day the app cannot read before reading anything, as a bad date', async () => {
    const { result, rpcCalls } = await add({ ...LUNCH, date: '0000-02-29' })
    expect(result).toEqual(says(SENTENCES.bad_date))
    expect(rpcCalls).toEqual([])
  })

  it('takes $100,000.00 and a day 366 days back, the owner’s today being 2026-09-30', async () => {
    expect((await add({ ...LUNCH, amount: '100000.01' })).result).toEqual(says(SENTENCES.bad_amount))
    expect(body((await add({ ...LUNCH, amount: '100,000', date: '2025-09-29' })).rpcCalls[1])).toMatchObject({ p_amount_cents: -10000000, p_posted_on: '2025-09-29' })
  })

  it.each([
    ['a day after the owner’s today', { ...LUNCH, date: '2026-10-01' }, OWNER, SENTENCES.bad_date],
    ['367 days back', { ...LUNCH, date: '2025-09-28' }, OWNER, SENTENCES.bad_date],
    ['no card account yet', LUNCH, { ...OWNER, account: null }, SENTENCES.no_account],
    ['a refused read', LUNCH, { refused: 'ai_apps_off' }, SENTENCES.ai_apps_off],
    ['a read it cannot use', LUNCH, { ...OWNER, today: 'SECRET' }, SENTENCES.records_unreadable],
  ])('refuses %s once it has read, and adds nothing', async (_, args, read, sentence) => {
    const { result, rpcCalls } = await add(args, owner(read))
    expect(result).toEqual(says(sentence))
    expect(rpcCalls).toHaveLength(1)
  })

  it.each([
    ['already_waiting', 'Nothing was added: the same entry is already waiting in Review. For a second identical purchase the same day, set same_again to 2, 3 and so on.'],
    ['already_recorded', 'Nothing was added: the same entry is already in the owner’s approved records.'],
  ])('says %s when the row is there already', async (status, message) => {
    const { result } = await add(LUNCH, owner(OWNER, { status, waiting: 4 }))
    expect(result.structuredContent).toMatchObject({ status, waiting_in_review: 4, message })
  })

  it.each([
    ['the database refusing the add', { refused: 'adding_off' }, SENTENCES.adding_off],
    ['the hash at another version', { refused: 'needs_update' }, SENTENCES.needs_update],
    ['a refusal only a direct caller meets', { refused: 'bad_words' }, SENTENCES.not_confirmed],
    ['an answer it cannot read', { status: 'approved', waiting: 1 }, SENTENCES.not_confirmed],
  ])('answers %s with one sentence', async (_, added, sentence) => {
    expect((await add(LUNCH, owner(OWNER, added))).result).toEqual(says(sentence))
  })
})

describe('add_note', () => {
  const note = (args: Record<string, unknown>, rpc: Rpc = owner(OWNER)) => callTool(rpc, 'add_note', args)

  it('reads a sentence as Just type it does, from the owner’s today, and adds it as add_expense would', async () => {
    const { result, rpcCalls } = await note({ text: 'Lunch at Subway 12.50 yesterday' })
    expect(body(rpcCalls[0])).toMatchObject({ p_parts: ['account'] })
    expect(body(rpcCalls[1])).toMatchObject({ p_posted_on: '2026-09-29', p_amount_cents: -1250, p_words: 'Lunch at Subway', p_occurrence: 1, p_dedupe_hash: LUNCH_1 })
    expect(result.structuredContent).toMatchObject({ status: 'added', entry: { date: '2026-09-29', what: 'Lunch at Subway', amount: $(-1250, '-$12.50') } })
  })

  it('sends a category as stored, and same_again as the occurrence', async () => {
    const { rpcCalls } = await note({ text: 'spent $12.50 on Lunch at Subway yesterday', category: 'Eating out', same_again: 2 })
    expect(body(rpcCalls[1])).toMatchObject({ p_words: 'Lunch at Subway', p_category_name: 'Eating out​', p_dedupe_hash: LUNCH_2 })
  })

  // Two numbers that could each be the amount, or a date with slashes, are never guessed (F47).
  it.each([
    ['got paid 2100', 'got paid 2100', ['what'], { date: '2026-09-30', what: null, amount: $(210000, '$2,100.00'), flow: 'received' }],
    ['two amounts and a slashed date', 'coffee 4 or 5 on 9/28', ['amount', 'date'], { date: null, what: 'coffee 4 or 5', amount: null, flow: 'spent' }],
    ['a day after today', 'coffee 4.50 2026-10-01', ['date'], { date: null, what: 'coffee', amount: $(-450, '-$4.50'), flow: 'spent' }],
    ['words past 120 characters', `${'x'.repeat(121)} 4.50`, ['what'], { date: '2026-09-30', what: null, amount: $(-450, '-$4.50'), flow: 'spent' }],
    ['words read so far, cleaned', 'coffee 4 or 5 1234567', ['amount'], { date: '2026-09-30', what: 'coffee 4 or 5 *******', amount: null, flow: 'spent' }],
  ])('adds nothing for %s, and says what is missing', async (_, text, missing, read_so_far) => {
    const { result, rpcCalls } = await note({ text })
    expect(rpcCalls).toHaveLength(1)
    expect(result.structuredContent).toEqual({ as_of: '2026-09-30', status: 'needs_more', missing, read_so_far, message: expect.stringMatching(/^Nothing was added\. Ask the owner/) })
  })

  it.each([
    ['a day more than a year back', 'Lunch 12.50 2025-09-28', SENTENCES.bad_date],
    ['an amount over the most an add may be', 'car 150000', SENTENCES.bad_amount],
  ])('refuses %s once it has read, and adds nothing', async (_, text, sentence) => {
    const { result, rpcCalls } = await note({ text })
    expect(result).toEqual(says(sentence))
    expect(rpcCalls).toHaveLength(1)
  })

  it.each([
    ['more than 300 characters', { text: 'x'.repeat(301) }],
    ['a control character', { text: 'coffee 4.50\u0007' }],
    // mcp-2-05: a character that draws as nothing.
    ['an invisible character', { text: 'cof\u200bfee 4.50' }],
    ['a number for the words', { text: 4.5 }],
    ['an empty note', { text: ' ' }],
  ])('refuses %s before reading anything', async (_, args) => {
    const { result, rpcCalls } = await note(args)
    expect(result.isError).toBe(true)
    expect(rpcCalls).toEqual([])
  })
})
