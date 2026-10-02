import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MonthScreen } from '../src/screens/MonthScreen.js'
import type { Category, LedgerRow } from '../src/ledger.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import type { NarrateDaily } from '@budget/schema'
import { renderScreen } from './render-screen.js'
import { expectNoAxeViolations } from './axe.js'

// Thursday 24 September 2026, local noon. Only Date is faked.
const TODAY = new Date(2026, 8, 24, 12)

const cat = (id: string, name: string): Category => ({ id, name, kind: 'variable', sort_order: 0, weekly_budget_cents: null })
const tx = (id: string, posted_on: string, amount_cents: number, category_id: string): LedgerRow => ({
  id, posted_on, amount_cents, merchant_raw: 'SYNTHETIC SHOP', category_id, source: 'card_pdf',
})

/**
 * Hand-derived. 1–24 Sep $1,020.00 (groceries $900.00, dining $120.00)
 * against 1–24 Aug $1,180.00: $160.00 less. The week of 21 Sep: $120.00 on
 * the 22nd, against nothing in 14–17 Sep.
 */
function seeded(periodStart = '2026-07-01'): FakeSupabase {
  return createFakeSupabase({
    categories: [cat('groceries', 'Groceries'), cat('dining', 'Dining out')],
    ingest_batches: [{ id: 'b1', source: 'card_pdf', created_at: '2026-09-21T12:00:00Z', period_start: periodStart, period_end: '2026-09-20' }],
    transactions: [
      tx('t1', '2026-09-03', -90_000, 'groceries'),
      tx('t2', '2026-09-22', -12_000, 'dining'),
      tx('t3', '2026-08-04', -100_000, 'groceries'),
      tx('t4', '2026-08-20', -18_000, 'dining'),
    ],
  })
}

/** An element whose whole text is `s`, however it is split into spans. */
const whole = (s: string) => (_: string, el: Element | null) => el?.tagName === 'BUTTON' && el.textContent === s

/**
 * The line is its own lazy part, drawn after the Month (N87). setup-dom.ts
 * fetches its chunk, but its first render in a file still runs cold, and
 * under a loaded machine that cost most of a find's one second. Setup, not an assertion, so it waits for
 * the line as the page changes, bounded by vitest's hook limit; no test's
 * own wait is raised.
 */
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  renderScreen(<MonthScreen month={null} />, seeded())
  await new Promise<void>((resolve) => {
    const shown = () => [...document.querySelectorAll('button')].some((b) => b.textContent?.endsWith('Open the Coach.') === true)
    if (shown()) return resolve()
    const watch = new MutationObserver(() => {
      if (!shown()) return
      watch.disconnect()
      resolve()
    })
    watch.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
  cleanup()
  scroll.mockRestore()
  vi.useRealTimers()
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TODAY)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.location.hash = ''
})

describe('the Month’s coach line (D27)', () => {
  it('says the Coach’s line above the summary, and opens the Coach', async () => {
    renderScreen(<MonthScreen month={null} />, seeded())

    const line = await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))
    fireEvent.click(line)
    expect(window.location.hash).toBe('#/coach')
    await expectNoAxeViolations()
  })

  it('speaks in the tone the owner chose, and in the Cheerleader’s without 0016', async () => {
    const fake = seeded()
    fake.tables.ai_settings.push({ user_id: 'u1', tone: 'straight' })
    renderScreen(<MonthScreen month={null} />, fake)
    expect(await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Open the Coach.'))).toBeTruthy()
    cleanup()
    const missing = seeded()
    missing.fail('ai_settings', 'PGRST205')
    renderScreen(<MonthScreen month={null} />, missing)
    expect(await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))).toBeTruthy()
  })

  it('speaks of this week when the records do not reach last month’s same days', async () => {
    // Records from 8 Aug: 1–24 Aug is outside them; 14–17 Sep is inside.
    renderScreen(<MonthScreen month={null} />, seeded('2026-08-08'))

    expect(await screen.findByText(whole('You’ve spent $120.00 more this week than by this day last week. There’s still time to ease off. Open the Coach.'))).toBeTruthy()
  })

  it('is not on a month other than this one', async () => {
    renderScreen(<MonthScreen month="2026-08" />, seeded())

    expect(await screen.findByRole('group', { name: 'Compared with last month' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Open the Coach/ })).toBeNull()
  })

  it('hides itself when the digest throws, and the Month still shows', async () => {
    // A row last month names a category that did not load: the engine refuses it.
    const fake = seeded()
    fake.tables.transactions.push(tx('t9', '2026-08-10', -500, 'gone'))
    const caught = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    renderScreen(<MonthScreen month={null} />, fake)

    // React reports the error the boundary caught; by then the line has had its turn.
    await vi.waitFor(() => expect(caught).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Open the Coach/ })).toBeNull()
    expect(screen.getByRole('region', { name: 'Variable expenses' })).toBeTruthy()
    expect(screen.getByText('Last month did not load, so there is no comparison.', { exact: false })).toBeTruthy()
  })

  describe('with the AI’s words (A12)', () => {
    /** The helper answering the daily pack with a line on the summary; every brief sent is counted. */
    function helper(fake: FakeSupabase): { asked: number } {
      const count = { asked: 0 }
      const fallback = fake.functions.ai!
      fake.functions.ai = (body) => {
        if (body['action'] !== 'run') return fallback(body)
        count.asked += 1
        const brief = body['data'] as NarrateDaily
        const reply = { summary: `Lovely: {{${brief.summary}.change}} than by this day last month.`, cards: [], goal: null, quote: null }
        return new Response(JSON.stringify({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite', text: JSON.stringify(reply) }), { headers: { 'content-type': 'application/json' } })
      }
      return count
    }

    beforeEach(() => window.localStorage.clear())

    it('asks once, in the background after the Month has drawn, and then shows the AI’s line, marked ✨', async () => {
      const fake = seeded()
      const count = helper(fake)
      renderScreen(<MonthScreen month={null} />, fake)
      // The app's own line first; the Coach's year is read only after it.
      expect(await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))).toBeTruthy()
      expect(await screen.findByText(whole('✨ Written by AI: Lovely: $160.00 less than by this day last month. Open the Coach.'))).toBeTruthy()
      expect(count.asked).toBe(1)
      await vi.waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
    })

    it('uses words kept for its own summary without asking, and never asks twice a day', async () => {
      const fake = seeded()
      const count = helper(fake)
      renderScreen(<MonthScreen month={null} />, fake)
      await screen.findByText(whole('✨ Written by AI: Lovely: $160.00 less than by this day last month. Open the Coach.'))
      await vi.waitFor(() => expect(fake.tables.ai_notes).toHaveLength(1))
      cleanup()
      // Another device: nothing marked here, but today's words are kept.
      window.localStorage.clear()
      renderScreen(<MonthScreen month={null} />, fake)
      expect(await screen.findByText(whole('✨ Written by AI: Lovely: $160.00 less than by this day last month. Open the Coach.'))).toBeTruthy()
      expect(count.asked).toBe(1)
    })

    it('leaves the Coach’s year unread once today’s ask is used', async () => {
      const fake = seeded()
      const count = helper(fake)
      const reads: string[] = []
      fake.server.afterRead = (table) => void reads.push(table)
      window.localStorage.setItem('budget.coach.asked', '2026-09-24')
      renderScreen(<MonthScreen month={null} />, fake)
      expect(await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))).toBeTruthy()
      await vi.waitFor(() => expect(reads).toContain('ai_notes'))
      // Long enough for the Coach's Day to start its reads, if it were built.
      await new Promise((resolve) => setTimeout(resolve, 50))
      // insight_dismissals is read only by the Coach's Day, which the Month builds only to ask.
      expect(reads).not.toContain('insight_dismissals')
      expect(count.asked).toBe(0)
    })

    it('keeps the app’s own line, and the Month, when the AI helper is not installed', async () => {
      const fake = seeded()
      fake.functions.ai = null
      renderScreen(<MonthScreen month={null} />, fake)
      expect(await screen.findByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))).toBeTruthy()
      await vi.waitFor(() => expect(fake.functions.calls.some((c) => c['action'] === 'run')).toBe(true))
      expect(screen.getByText(whole('You’ve spent $160.00 less than by this day last month. Nice going! Open the Coach.'))).toBeTruthy()
      expect(screen.getByRole('region', { name: 'Variable expenses' })).toBeTruthy()
    })
  })
})
