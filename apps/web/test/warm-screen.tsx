import { cleanup } from '@testing-library/react'
import { vi } from 'vitest'
import { Shell } from '../src/App.js'
import { createFakeSupabase } from './fake-supabase.js'
import { renderScreen } from './render-screen.js'

/**
 * Render the app once at `hash` until the screen's title shows, then clear
 * it, for a file's beforeAll. The first render of a lazy screen in a test
 * file suspends on its chunk, React holds the revealed screen back for a
 * moment, and the code runs cold: about half a second of a find's one
 * second (N87). Rendered once first, a file's tests wait for the screen's
 * reads alone.
 *
 * This is setup, not an assertion, so it waits for the title itself, as
 * the page changes, rather than race a find's one second, which a busy
 * machine can lose here just as it did in the tests. vitest's hook limit
 * still ends a screen that never shows. No test's own wait is raised.
 */
export async function warmScreen(hash: string, title: string): Promise<void> {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.location.hash = hash
  renderScreen(<Shell />, createFakeSupabase())
  await new Promise<void>((resolve) => {
    const shown = () => [...document.querySelectorAll('h1')].some((h) => h.textContent === title)
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
