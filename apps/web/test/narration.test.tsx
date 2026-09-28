import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NarrateDaily, NarrateReply } from '@budget/schema'
import { Shell } from '../src/App.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * The Coach's words from the AI (plan A12): the app's own first, the AI's
 * swapped in once checked and kept, reused while their claims hold and
 * drawn with today's figures, and never a figure of the AI's own. The
 * records are coach-cards' (hand-derived there): the month is $300.00 up
 * on 1–24 Aug; the cards are stale data, two rows in Review, and Dining
 * out's rise of $300.00.
 */
const TODAY = new Date(2026, 8, 24, 12)
const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})
const pending = (id: string) => ({ id, posted_on: '2026-09-20', amount_cents: -1349, merchant: 'SYNTHETIC CAFE', merchant_raw: 'SYNTHETIC CAFE', status: 'pending' })

function seeded(dining = 'Dining out'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('dining', dining), cat('groceries', 'Groceries')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-08T12:00:00Z', period_start: '2026-06-01', period_end: '2026-09-07' }],
    ingest_candidates: [pending('p1'), pending('p2')],
    transactions: [
      ...['06', '07', '08'].flatMap((m) => [tx(`d${m}`, `2026-${m}-10`, -30_000, 'dining'), tx(`g${m}`, `2026-${m}-12`, -40_000, 'groceries')]),
      tx('d09', '2026-09-03', -60_000, 'dining'),
      tx('g09', '2026-09-12', -40_000, 'groceries'),
    ],
  })
}

/** What a well-behaved model writes for a brief: each card by its own letter, figures only as blanks. */
function replyFor(brief: NarrateDaily, over: (card: NarrateReply['cards'][number]) => NarrateReply['cards'][number] = (c) => c): NarrateReply {
  const kindOf = (id: string) => brief.facts.find((f) => f.id === id)?.kind
  return {
    summary: `Heads up: {{${brief.summary}.change}} than by this day last month.`,
    cards: brief.cards.map((id) =>
      over({
        fact: id,
        title: kindOf(id) === 'category_change' ? `Busy month for {{${id}.name}}` : 'A quick one',
        body: kindOf(id) === 'category_change' ? `You spent {{${id}.change}} on it than last month.` : 'Worth a look today.',
        tryThis: kindOf(id) === 'category_change' ? 'One thing to try: cook at home a few nights.' : null,
      }),
    ),
    goal: null,
    quote: null,
  }
}

type Answer = (brief: NarrateDaily) => Response | Promise<Response>
const ok = (reply: NarrateReply) => new Response(JSON.stringify({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(reply) }), { headers: { 'content-type': 'application/json' } })

/** The helper answering the daily pack with `answer`; every brief sent is kept. */
function helper(fake: FakeSupabase, answer: Answer = (b) => ok(replyFor(b))): NarrateDaily[] {
  const briefs: NarrateDaily[] = []
  const fallback = fake.functions.ai!
  fake.functions.ai = (body) => {
    if (body['action'] !== 'run') return fallback(body)
    briefs.push(body['data'] as NarrateDaily)
    return answer(body['data'] as NarrateDaily)
  }
  return briefs
}

const whole = (tag: string, s: string) => (_: string, el: Element | null) => el?.tagName === tag && el.textContent === s
const headings = () => within(screen.getByRole('region', { name: 'Insights' })).getAllByRole('heading').map((h) => h.textContent)

function go(hash: string) {
  act(() => {
    window.location.hash = hash
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

beforeAll(() => warmScreen('#/coach', 'Coach'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.localStorage.clear()
  go('/coach')
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the AI’s words on the Coach', () => {
  it('draws the app’s own words first, then swaps in the AI’s, marked ✨, with every figure the app’s', async () => {
    const fake = seeded()
    let answer: (r: Response) => void = () => undefined
    const briefs = helper(fake, () => new Promise<Response>((resolve) => (answer = resolve)))
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', 'You’ve spent $300.00 more than by this day last month. There’s still time to ease off.'))).toBeTruthy()
    await screen.findByText('Asking the AI for today’s words. The app’s own show meanwhile.')
    expect(headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
    // The brief names things and directions; the amounts are nowhere in it.
    expect(JSON.stringify(briefs[0])).not.toMatch(/300|600|1000|700/)
    answer(ok(replyFor(briefs[0]!)))

    expect(await screen.findByText(whole('P', '✨ Written by AI: Heads up: $300.00 more than by this day last month.'))).toBeTruthy()
    expect(headings()).toEqual(['✨ Written by AI: A quick one', '✨ Written by AI: A quick one', '✨ Written by AI: Busy month for Dining out'])
    expect(screen.getByText(whole('P', 'You spent $300.00 more on it than last month.'))).toBeTruthy()
    expect(screen.getByText('✨ Words by AI (free Google Gemini) from your numbers. Every figure is the app’s own.').getAttribute('aria-live')).toBe('polite')
    await expectNoAxeViolations()
  })

  it('keeps the checked words with no figure, and reuses them the next time, drawn with today’s figures', async () => {
    const fake = seeded()
    const briefs = helper(fake)
    renderScreen(<Shell />, fake)
    await screen.findByText(whole('P', 'You spent $300.00 more on it than last month.'))
    await waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    const kept = fake.tables.ai_notes[0]!
    expect(kept).toMatchObject({ surface: 'daily', scope: 'day:2026-09-24', prompt_v: 1, provider: 'gemini' })
    expect(JSON.stringify(kept['body'])).not.toMatch(/[\p{N}\p{Sc}%]/u)
    cleanup()

    // A dollar more at Dining out: the same claims, so the kept words, with the new figure, and no new ask.
    Object.assign(fake.tables.transactions.find((t) => t.id === 'd09')!, { amount_cents: -60_100 })
    Object.assign(kept, { created_at: '2026-09-24T12:00:00Z' })
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(whole('P', 'You spent $301.00 more on it than last month.'))).toBeTruthy()
    expect(briefs).toHaveLength(1)
  })

  it('never shows words kept for claims that have changed, and offers Refresh instead of asking again today', async () => {
    const fake = seeded()
    const briefs = helper(fake)
    renderScreen(<Shell />, fake)
    await screen.findByText(whole('P', 'You spent $300.00 more on it than last month.'))
    await waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    cleanup()

    // Straight talker: every part's claims are in a new tone, so none of the kept words fit.
    fake.tables.ai_settings.push({ user_id: 'u1', tone: 'straight' })
    renderScreen(<Shell />, fake)
    const refresh = await screen.findByRole('button', { name: 'Refresh the AI’s words' })
    expect(headings()).toEqual(['Your records are out of date', 'Review has charges waiting', 'Up on last month: Dining out'])
    expect(briefs).toHaveLength(1)
    fireEvent.click(refresh)
    expect(await screen.findByText(whole('H2', '✨ Written by AI: Busy month for Dining out'))).toBeTruthy()
    expect(briefs.map((b) => b.tone)).toEqual(['cheerleader', 'straight'])
  })

  it('drops only the card whose words break the rules, and a model’s markup never becomes markup', async () => {
    const fake = seeded('<img src=x onerror=alert(1)>')
    helper(fake, (b) =>
      ok(
        replyFor(b, (c) =>
          // Review's card in markup (the text rule), Dining out's saying "fell" beside a rise (checkReply).
          c.fact === b.cards[1] ? { ...c, title: '<img src=x onerror=alert()>' } : c.fact === b.cards[2] ? { ...c, body: `It fell: {{${c.fact}.change}}.` } : c,
        ),
      ),
    )
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(whole('P', '✨ Written by AI: Heads up: $300.00 more than by this day last month.'))).toBeTruthy()
    expect(headings()).toEqual(['✨ Written by AI: A quick one', 'Charges waiting for you', 'Running ahead: <img src=x onerror=alert(1)>'])
    // The owner's own name for a category is drawn as the characters it is.
    expect(document.querySelector('img')).toBeNull()
  })

  it('shows the app’s own words, and says why, when the AI helper is not installed', async () => {
    const fake = seeded()
    fake.functions.ai = null
    renderScreen(<Shell />, fake)

    expect(await screen.findByText(/The AI helper isn’t installed yet/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Help: One-time updates' }).getAttribute('href')).toBe('#/help/updates')
    expect(headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
  })

  // Today's one automatic ask is used by whichever of the Month and the
  // Coach opens first; the other still says why the words are the app's own.
  it('still says why on a later visit, once today’s ask found no AI helper', async () => {
    const fake = seeded()
    fake.functions.ai = null
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/The AI helper isn’t installed yet/)).toBeTruthy()
    cleanup()
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/The AI helper isn’t installed yet/)).toBeTruthy()
    expect(fake.functions.calls.filter((c) => c['action'] === 'run')).toHaveLength(1)
  })

  it('still says every service is resting on a later visit, while the helper and a key are there', async () => {
    const fake = seeded()
    fake.functions.aiStatus = {
      ...fake.functions.aiStatus,
      services: fake.functions.aiStatus.services.map((sv) => (sv.provider === 'gemini' ? { ...sv, source: 'saved' as const, hint: 'k3Yz', status: 'ok' as const } : sv)),
    }
    const briefs = helper(fake, () => new Response(JSON.stringify({ ok: false, code: 'all_resting' }), { status: 429, headers: { 'content-type': 'application/json' } }))
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/Every AI service is resting for a while/)).toBeTruthy()
    cleanup()
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/Every AI service is resting for a while/)).toBeTruthy()
    expect(briefs).toHaveLength(1)
  })

  it('says what is wrong now, not what was, once the helper is installed later that day', async () => {
    const fake = seeded()
    fake.functions.ai = null
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(/The AI helper isn’t installed yet/)).toBeTruthy()
    cleanup()
    // Installed since, with no key yet: today's ask is spent, so the Coach says what is left to do.
    fake.functions.ai = (body) => new Response(JSON.stringify(body['action'] === 'status' ? fake.functions.aiStatus : { ok: false, code: 'not_set_up' }), { headers: { 'content-type': 'application/json' } })
    renderScreen(<Shell />, fake)
    expect(await screen.findByRole('link', { name: 'Turn on free AI (2 minutes)' })).toBeTruthy()
    expect(screen.queryByText(/The AI helper isn’t installed yet/)).toBeNull()
    cleanup()
    // Then a key: nothing is wrong now, and today's ask is still spent.
    fake.functions.aiStatus = {
      ...fake.functions.aiStatus,
      services: fake.functions.aiStatus.services.map((sv) => (sv.provider === 'gemini' ? { ...sv, source: 'saved' as const, hint: 'k3Yz', status: 'ok' as const } : sv)),
    }
    renderScreen(<Shell />, fake)
    expect(await screen.findByText('In the app’s own words, from your records.')).toBeTruthy()
    await waitFor(() => expect(fake.functions.calls.filter((c) => c['action'] === 'status').length).toBeGreaterThan(1))
    expect(screen.queryByText(/The AI helper isn’t installed yet/)).toBeNull()
  })

  it('works uncached without 0017, asking once a day by itself', async () => {
    const fake = seeded()
    fake.fail('ai_notes', 'PGRST205')
    const briefs = helper(fake)
    renderScreen(<Shell />, fake)
    expect(await screen.findByText(whole('H2', '✨ Written by AI: Busy month for Dining out'))).toBeTruthy()
    cleanup()
    renderScreen(<Shell />, fake)
    // Settled on the app's own words, with nothing kept to reuse and today's ask already used.
    expect(await screen.findByText('In the app’s own words, from your records.')).toBeTruthy()
    expect(headings()).toEqual(['Time for a fresh statement', 'Charges waiting for you', 'Running ahead: Dining out'])
    expect(briefs).toHaveLength(1)
  })
})
