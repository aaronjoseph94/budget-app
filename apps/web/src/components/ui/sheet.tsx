import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './button.js'
import { Icon } from './icons.js'

/**
 * A panel over the screen: from the bottom on a phone, where a thumb reaches
 * it, and centred on a desktop. Escape, the backdrop and the close button all
 * close it, Tab stays inside it while it is open, and focus goes back to
 * what opened it.
 *
 * Hand-written rather than the native <dialog>: showModal is missing from the
 * test DOM, and a sheet the screen tests cannot open is a sheet nothing tests.
 * `title` is text, so a category or shop name in it is never markup.
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  // The latest onClose, without re-running the open/close effect below each
  // render: that effect moves focus, and must do so once each way.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useBackCloses(close)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key === 'Tab') keepFocusInside(panel.current, e)
    }
    document.addEventListener('keydown', onKey)
    // The month behind stays where it was instead of scrolling under a finger.
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus()
    }
  }, [])

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={() => close.current()} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="safe-bottom relative flex max-h-[85dvh] w-full flex-col rounded-t-2xl border bg-card text-card-foreground shadow-lg outline-none md:max-w-lg md:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="break-words text-lg font-semibold [overflow-wrap:anywhere]">
              {title}
            </h2>
            {subtitle !== undefined ? <div className="text-sm text-muted-foreground">{subtitle}</div> : null}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={() => close.current()}>
            <Icon name="x" />
          </Button>
        </div>
        <div className="overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}

/**
 * Back closes the sheet, as on a phone's own sheets. Opening one added no
 * history entry, so the Back gesture left the screen and dropped what was
 * typed in it (bug bash, phone). Each sheet now stands on an entry of its
 * own, at the same address: Back pops it and closes the sheet; closed by
 * its own buttons, Escape or the backdrop, it takes its entry back off, so
 * the next Back leaves the screen. A same-address entry fires popstate and
 * no hashchange, so nav.ts's address and scroll-memory.ts never see it.
 *
 * Going back is not instant, so a sheet opened before it lands waits to
 * push its own (two sheets in a row, React's development double mount).
 */
const SHEET = 'sheet'
let made = 0
/** Unique to this page load: an entry left from before a reload is never taken for an open sheet's. */
const visit = Math.random().toString(36).slice(2, 8)
const open = new Set<string>()
let landing: Promise<void> | null = null
/** The state of the entry showing, as last seen: where a popstate came from. */
let shown: unknown = null

function tokenOf(state: unknown): string | null {
  const token = typeof state === 'object' && state !== null ? (state as Record<string, unknown>)[SHEET] : undefined
  return typeof token === 'string' ? token : null
}
const keyOf = (state: unknown): unknown => (typeof state === 'object' && state !== null ? (state as Record<string, unknown>).scrollKey : undefined)

function useBackCloses(close: { readonly current: () => void }): void {
  useEffect(() => {
    const token = `${visit}-${++made}`
    let pushed = false
    let gone = false
    const onPop = () => {
      if (tokenOf(window.history.state) === token) return
      window.removeEventListener('popstate', onPop)
      open.delete(token)
      gone = true
      close.current()
    }
    const push = () => {
      if (gone) return
      window.history.pushState({ ...(window.history.state as object | null), [SHEET]: token }, '')
      shown = window.history.state
      pushed = true
      open.add(token)
      window.addEventListener('popstate', onPop)
    }
    if (landing === null) push()
    else void landing.then(push)
    return () => {
      window.removeEventListener('popstate', onPop)
      open.delete(token)
      const wasOpen = !gone
      gone = true
      if (!pushed || !wasOpen || tokenOf(window.history.state) !== token) return
      landing = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true })).then(() => {
        landing = null
      })
      window.history.back()
    }
  }, [close])
}

/**
 * A sheet's entry left behind when its sheet saved and moved to another
 * screen. Back from that screen lands on it, showing the screen the sheet
 * was on; a second Back would change nothing, so it is stepped over, on in
 * the direction the owner was going.
 */
function stepOverLeftEntries(): void {
  const before = shown
  shown = window.history.state
  const token = tokenOf(shown)
  if (token === null || landing !== null || open.has(token)) return
  const forward = keyOf(before) !== undefined && keyOf(before) === keyOf(shown) && tokenOf(before) === null
  if (forward) window.history.forward()
  else window.history.back()
}
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', stepOverLeftEntries)
  // Once every listener has run: scroll-memory.ts keys a new entry in its own.
  window.addEventListener('hashchange', () => void setTimeout(() => (shown = window.history.state)))
}

const FOCUSABLE ='a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Tab and Shift+Tab wrap around inside the open sheet. Without this a
 * keyboard walks out of it into the month behind the backdrop, which a
 * screen reader has been told (aria-modal) is not there.
 */
function keepFocusInside(panel: HTMLElement | null, e: KeyboardEvent): void {
  if (panel === null) return
  const inside = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = inside[0]
  const last = inside[inside.length - 1]
  if (first === undefined || last === undefined) return
  const at = document.activeElement
  if (e.shiftKey && (at === first || at === panel || !panel.contains(at))) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
    e.preventDefault()
    first.focus()
  }
}
