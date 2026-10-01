import { cleanup, render, screen } from '@testing-library/react'
import { lazy, type ComponentType } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScreenBoundary } from '../src/shell/ScreenBoundary.js'
import { reloadOnceOnPreloadError } from '../src/shell/preload-reload.js'

afterEach(() => cleanup())

describe('a screen that cannot load (FE-1)', () => {
  it('says so, with a way to reload, where a chunk that did not arrive left a blank page', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const Missing = lazy<ComponentType>(() => Promise.reject(new Error('Failed to fetch dynamically imported module')))
    render(
      <ScreenBoundary screen="week">
        <Missing />
      </ScreenBoundary>,
    )
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('This screen did not load. Check your connection, then reload.')
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    quiet.mockRestore()
  })

  it('draws the screen when it loads', async () => {
    const Here = lazy<ComponentType>(() => Promise.resolve({ default: () => <h1>The week</h1> }))
    render(
      <ScreenBoundary screen="week">
        <Here />
      </ScreenBoundary>,
    )
    expect((await screen.findByRole('heading')).textContent).toBe('The week')
  })
})

describe('a chunk from an older deploy (FE-1)', () => {
  function storage(): Storage {
    const kept = new Map<string, string>()
    return {
      getItem: (k: string) => kept.get(k) ?? null,
      setItem: (k: string, v: string) => void kept.set(k, v),
      removeItem: (k: string) => void kept.delete(k),
      clear: () => kept.clear(),
      key: () => null,
      get length() {
        return kept.size
      },
    }
  }

  it('reloads the page once, and not again in a loop', () => {
    const reload = vi.fn()
    const kept = storage()
    expect(reloadOnceOnPreloadError(kept, reload, true)).toBe(true)
    expect(reloadOnceOnPreloadError(kept, reload, true)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it("leaves the screen's own note while offline, where a reload would lose the app to the browser's error page", () => {
    const reload = vi.fn()
    const kept = storage()
    expect(reloadOnceOnPreloadError(kept, reload, false)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    // The one reload is still there for a chunk that fails once back online.
    expect(reloadOnceOnPreloadError(kept, reload, true)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload when storage is blocked, since it could not stop a loop', () => {
    const reload = vi.fn()
    expect(reloadOnceOnPreloadError(null, reload, true)).toBe(false)
    const throws = storage()
    throws.getItem = () => {
      throw new Error('blocked')
    }
    expect(reloadOnceOnPreloadError(throws, reload, true)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })
})
