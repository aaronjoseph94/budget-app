import { readFileSync } from 'node:fs'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'
import { warmScreen } from './warm-screen.js'
import { expectNoAxeViolations } from './axe.js'

/**
 * One-time updates' Copy button (ADR 0007): the committed file, fetched
 * from the site's /setup/ when the step shows, written to the clipboard on
 * the tap. The site is a stand-in `fetch` serving the committed files.
 */
// The repository's root, from this file's own address. Vite rewrites a
// `new URL(…, import.meta.url)` in a test, so the path is cut as text.
const ROOT = decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/apps\/web\/test\/[^/]+$/, ''))
const committed = (path: string) => readFileSync(`${ROOT}${path}`, 'utf8')
const SITE: Record<string, string> = {
  '/setup/0016_ai_foundation.sql': committed('supabase/migrations/0016_ai_foundation.sql'),
  '/setup/ai-function.ts': committed('supabase/functions/ai/index.ts'),
}
let asked: string[] = []
// A static host answers a path it does not have with the app's own page.
const host = (path: string) => new Response(SITE[path] ?? '<!doctype html><title>Budget</title>')
let site = host
const writeText = vi.fn<(text: string) => Promise<void>>()

beforeAll(() => warmScreen('#/help/updates', 'One-time updates'))

beforeEach(() => {
  asked = []
  site = host
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    return site(url)
  })
  writeText.mockReset().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  act(() => {
    window.location.hash = '#/help/updates'
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.location.hash = ''
})

async function nextIs(fake: FakeSupabase, button: string) {
  renderScreen(<Shell />, fake)
  await screen.findByRole('heading', { level: 1, name: 'One-time updates' })
  return screen.findByRole('button', { name: button })
}

describe('Copy on One-time updates', () => {
  it('copies 0016 exactly as committed, and says what to do with it', async () => {
    const fake = createFakeSupabase()
    delete fake.rpcReplies['ai_key_status']
    const copy = await nextIs(fake, 'Copy 0016_ai_foundation.sql')
    // Before Copy, its live line is there but empty, and takes no room (N77).
    const live = copy.parentElement!.querySelector('[aria-live="polite"]')!
    expect(live.textContent).toBe('')
    expect(live.classList.contains('empty:sr-only')).toBe(true)
    fireEvent.click(copy)
    expect(await screen.findByText('Copied. Now paste it into Supabase.')).toBeTruthy()
    expect(writeText.mock.calls).toEqual([[SITE['/setup/0016_ai_foundation.sql']]])
    expect(asked).toEqual(['/setup/0016_ai_foundation.sql'])
    // GitHub stays the way round.
    expect(screen.getByRole('link', { name: 'Open 0016_ai_foundation.sql on GitHub' })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('copies the AI helper when it is next', async () => {
    const fake = createFakeSupabase()
    fake.functions.ai = null
    fireEvent.click(await nextIs(fake, 'Copy the AI helper'))
    await screen.findByText('Copied. Now paste it into Supabase.')
    expect(writeText.mock.calls).toEqual([[SITE['/setup/ai-function.ts']]])
  })

  it('shows the text to select by hand when the browser refuses the clipboard', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    const fake = createFakeSupabase()
    delete fake.rpcReplies['ai_key_status']
    fireEvent.click(await nextIs(fake, 'Copy 0016_ai_foundation.sql'))
    const box = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: 'The text of 0016_ai_foundation.sql' })
    expect(box.value).toBe(SITE['/setup/0016_ai_foundation.sql'])
    expect(screen.getByText('Your browser didn’t allow copying. Select all of the text below and copy it.')).toBeTruthy()
  })

  it('never offers the site’s own page, or a file it could not get, as the update', async () => {
    site = (path) => (path.endsWith('.sql') ? new Response('<!doctype html><title>Budget</title>') : new Response('', { status: 500 }))
    const fake = createFakeSupabase()
    delete fake.rpcReplies['ai_key_status']
    renderScreen(<Shell />, fake)
    expect(await screen.findByText('Couldn’t get the file here. Open it on GitHub below instead.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Copy/ })).toBeNull()
    expect(screen.getByRole('link', { name: 'Open 0016_ai_foundation.sql on GitHub' })).toBeTruthy()
  })

  it('offers no Copy for an update from before 0015, which the site does not carry', async () => {
    const fake = createFakeSupabase()
    fake.fail('month_balances', 'PGRST205')
    renderScreen(<Shell />, fake)
    await screen.findByRole('link', { name: 'Open 0010_month_balances.sql on GitHub' })
    expect(screen.queryByRole('button', { name: /^Copy|Getting the file/ })).toBeNull()
    expect(asked).toEqual([])
  })
})
