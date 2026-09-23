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

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

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
