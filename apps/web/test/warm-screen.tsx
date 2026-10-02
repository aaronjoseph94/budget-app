import { cleanup } from '@testing-library/react'
import { vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase, type FakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Render the app once at `hash` until the screen's title shows, then clear
 * it, for a file's beforeAll. setup-dom.ts fetches the screen's chunk
 * before any test draws; what is left is the code running cold the first
 * time (N87). Rendered once first, a file's tests wait for the screen's
 * reads alone.
 *
 * This is setup, not an assertion, so it waits for the title itself, as
 * the page changes, rather than race a find's one second, which a busy
 * machine can lose here just as it did in the tests. vitest's hook limit
 * still ends a screen that never shows. No test's own wait is raised.
 */
export async function warmScreen(hash: string, title: string, until?: { readonly fake: FakeSupabase; readonly text: string }): Promise<void> {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.location.hash = hash
  renderScreen(<Shell />, until === undefined ? createFakeSupabase() : until.fake)
  await new Promise<void>((resolve) => {
    // With `until`, the file's own seed is drawn as far as the text its first
    // test waits for, so the engine code behind it has run once too (N90).
    const shown = () =>
      [...document.querySelectorAll('h1')].some((h) => h.textContent === title) &&
      (until === undefined || document.body.textContent?.includes(until.text) === true)
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
  window.location.hash = ''
}
