import { fileURLToPath } from 'node:url'
import type { Browser } from '@e2e-dev/web'
import type { JsonValue, Screen } from 'e2e'
import { expect } from 'e2e'

/**
 * What the suite reads off a page beyond its controls: the errors it
 * raised, how far it reaches past the right edge, axe's findings, and
 * what reached the fake server. All of it is put on `window` by an init
 * script or by apps/web/e2e/supabase-preview.ts.
 */
declare global {
  interface Window {
    __e2e?: { errors: string[] }
    __preview?: {
      rpcCalls: { name: string; args: Record<string, JsonValue> }[]
      tables: { ai_settings: { enabled?: boolean }[] }
    }
    axe?: {
      run: (
        context: Document,
        options: { runOnly: { type: 'tag'; values: string[] }; resultTypes: string[] },
      ) => Promise<{ violations: { id: string; help: string; nodes: { target: string[] }[] }[] }>
    }
  }
}

const AXE = fileURLToPath(new URL('../../apps/web/node_modules/axe-core/axe.min.js', import.meta.url))

/**
 * Before `app.open`: every uncaught error, unhandled rejection and
 * console error is kept on the page for `expectClean`, and, when asked,
 * axe-core is loaded for `axeOn`.
 */
export async function watch(browser: Browser, { axe = false }: { axe?: boolean } = {}): Promise<void> {
  await browser.addInitScript(() => {
    const kept: string[] = []
    window.__e2e = { errors: kept }
    window.addEventListener('error', (e) => kept.push(`error: ${e.message}`))
    window.addEventListener('unhandledrejection', (e) => kept.push(`rejection: ${String(e.reason)}`))
    const error = console.error
    console.error = (...args: unknown[]) => {
      kept.push(`console: ${args.map(String).join(' ')}`)
      error.apply(console, args)
    }
  })
  if (axe) await browser.addInitScript({ path: AXE })
}

/**
 * The screen named in the tab's title is open and drawn: the title names
 * it (shell/places.ts), its own h1 stands (the shell's sr-only "Budget"
 * is there only while the data loads) and nothing on it still says
 * Loading. Returns the h1's words.
 */
export async function expectScreen(screen: Screen, browser: Browser, name: string): Promise<string> {
  await expect(browser).toHaveTitle(`${name} · Budget`)
  const h1 = screen.getByRole('heading', { level: 1 })
  await expect.poll(() => h1.textContent(), { timeout: 20_000 }).toMatch(/^(?!Budget$)\S/)
  await expect(screen.getByRole('status', /^Loading /)).toHaveCount(0)
  return String(await h1.textContent()).trim()
}

/** The page raised no error, scrolls no further sideways than its width, and draws nothing past the right edge. */
export async function expectClean(browser: Browser): Promise<void> {
  expect(await browser.evaluate(() => window.__e2e?.errors ?? []), 'errors the page raised').toEqual([])
  const edge = await browser.evaluate(() => {
    const width = document.documentElement.clientWidth
    // Inside a box that scrolls or clips, past the edge is by design: a wide
    // table scrolls in its own box, and a long name is cut with an ellipsis.
    const clipped = (el: Element): boolean => {
      for (let a = el.parentElement; a !== null; a = a.parentElement) {
        const x = getComputedStyle(a).overflowX
        if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') return true
      }
      return false
    }
    const past: string[] = []
    for (const el of document.querySelectorAll('main *')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || clipped(el)) continue
      if (r.right > width + 1 || r.left < -1) {
        past.push(`${el.tagName.toLowerCase()}${el.id === '' ? '' : `#${el.id}`} ${Math.round(r.left)}..${Math.round(r.right)}`)
      }
    }
    return { width, scrollWidth: document.documentElement.scrollWidth, past: past.slice(0, 8) }
  })
  expect(edge.scrollWidth, `sideways scroll: ${edge.scrollWidth} wide in ${edge.width}`).toBeLessThanOrEqual(edge.width)
  expect(edge.past, `past the right edge of ${edge.width}`).toEqual([])
}

/** axe-core's findings on the page as drawn, each as rule, words and where; `[]` when it is clean. */
export function axeOn(browser: Browser): Promise<string[]> {
  return browser.evaluate(async () => {
    if (window.axe === undefined) throw new Error('axe is not on the page: watch(browser, { axe: true }) before app.open')
    // Words that fade in (`words-in`, index.css) read as low contrast
    // mid-fade: wait for every animation that ends. One that repeats for
    // ever, a spinner, never would; nor is a long one waited past 2 s.
    const ending = document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity)
    await Promise.all(ending.map((a) => Promise.race([a.finished.catch(() => undefined), new Promise((done) => setTimeout(done, 2000))])))
    const found = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    })
    return found.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${v.help} at ${n.target.join(' ')}`))
  })
}

/** The calls the fake server took under this name, with their arguments. */
export function rpcCalls(browser: Browser, name: string): Promise<Record<string, JsonValue>[]> {
  return browser.evaluate((wanted: string) => (window.__preview?.rpcCalls ?? []).filter((c) => c.name === wanted).map((c) => c.args), name)
}
