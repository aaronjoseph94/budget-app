/**
 * Where each page was scrolled to, so Back and Forward land there again.
 *
 * Every screen change scrolled to the top, history moves included: scroll
 * All transactions down, open More, go Back, and the list was at its top
 * (bug bash, phone). A new screen still starts at the top; a return to an
 * entry already seen goes back to where it was.
 *
 * Each history entry gets a key in its state the first time it is shown;
 * a new address (a link, `location.hash =`) is an entry with no state, and
 * Back and Forward bring the state back with the entry. The positions are
 * kept here, in memory, not written to the entry on every scroll: Safari
 * refuses more than 100 replaceState calls in 30 seconds.
 *
 * The browser's own restoring is off: on a hash move it put back a position
 * before the screen had drawn, and the scroll it caused was counted against
 * the page being left. The screen draws after its data arrives, so the
 * position is put back once the page is tall enough, or given up after a
 * moment, or as soon as the owner scrolls or touches the page.
 */
const KEY = 'scrollKey'
const positions = new Map<string, number>()
let current: string | null = null
/** The entry the last history move returned to; null after a new address. */
let back: string | null = null
let restoring: (() => void) | null = null
let made = 0
const visit = Math.random().toString(36).slice(2, 8)

function keyOf(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !(KEY in state)) return null
  const key = (state as Record<string, unknown>)[KEY]
  return typeof key === 'string' ? key : null
}

/** True while the entry showing is one already seen here: Back or Forward, not a new address. */
export function returning(): boolean {
  const key = keyOf(window.history.state)
  return key !== null && key === back
}

/** The entry showing, given a key if it has none; a return starts putting its position back. */
function arrive(): void {
  restoring?.()
  const key = keyOf(window.history.state)
  if (key === null || !positions.has(key)) {
    const fresh = key ?? `${visit}-${++made}`
    if (key === null) window.history.replaceState({ ...(window.history.state as object | null), [KEY]: fresh }, '')
    current = fresh
    back = null
    positions.set(fresh, 0)
    return
  }
  current = key
  back = key
  putBack(positions.get(key) ?? 0)
}

function putBack(y: number): void {
  const until = performance.now() + 1500
  let frame = 0
  const stop = () => {
    cancelAnimationFrame(frame)
    for (const type of STOPPERS) window.removeEventListener(type, stop)
    restoring = null
  }
  const step = () => {
    const room = document.documentElement.scrollHeight - window.innerHeight
    if (room >= y || performance.now() > until) {
      window.scrollTo({ top: Math.min(y, Math.max(0, room)) })
      stop()
      return
    }
    frame = requestAnimationFrame(step)
  }
  for (const type of STOPPERS) window.addEventListener(type, stop, { passive: true })
  restoring = stop
  frame = requestAnimationFrame(step)
}

/** The owner taking the page back: a position is not put back over them. */
const STOPPERS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const

let installed = false

/**
 * Starts keeping positions. Called once, before the app first draws, so its
 * hashchange listener runs before the screen's own (App's), which asks
 * `returning()` whether to start at the top.
 */
export function rememberScroll(): void {
  if (installed) return
  installed = true
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
  arrive()
  window.addEventListener('hashchange', arrive)
  window.addEventListener(
    'scroll',
    () => {
      // Only a scroll of the entry showing, and not the one being put back.
      if (restoring === null && current !== null && keyOf(window.history.state) === current) positions.set(current, window.scrollY)
    },
    { passive: true },
  )
}
