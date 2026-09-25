import { cleanup, screen } from '@testing-library/react'
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
 * reads alone. No timeout is raised.
 */
export async function warmScreen(hash: string, title: string): Promise<void> {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  window.location.hash = hash
  renderScreen(<Shell />, createFakeSupabase())
  await screen.findByRole('heading', { name: title, level: 1 })
  cleanup()
  scroll.mockRestore()
  window.location.hash = ''
}
