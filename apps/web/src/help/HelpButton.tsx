import { Suspense, useEffect, useRef, useState } from 'react'
import { lazyPart } from '../lib/lazy-part.js'
import type { Screen } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'
import { SCREEN_HELP } from './screen-help.js'
import type { HelpTopic } from './topics.js'

// The sheet and the articles are fetched when a ? is first pressed, so the
// Month's first load carries the button alone.
const HelpSheet = lazyPart(() => import('./HelpSheet.js').then((m) => ({ default: m.HelpSheet })))

/**
 * The ? beside a screen's title (plan §2.1): that screen's Help article in
 * a bottom sheet, or `topic`'s where a screen has two parts, as the Coach
 * and its check-in do. It takes the colour of the title beside it, so it reads
 * on each screen's own band, and is a 44px target on every pointer.
 * Closing the sheet puts focus back on it. The sheet itself returns focus
 * to what held it when it opened, and a tap in Safari does not focus the
 * button it taps, so that was the screen, not the ?.
 */
export function HelpButton({ screen, topic, className }: { screen: Exclude<Screen, 'help'>; topic?: HelpTopic; className?: string }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const was = useRef(false)
  useEffect(() => {
    if (was.current && !open) button.current?.focus()
    was.current = open
  }, [open])
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Help with this screen"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors',
          'hover:bg-black/5 focus-visible:ring-[3px] focus-visible:ring-ring dark:hover:bg-white/10',
          className,
        )}
      >
        <Icon name="help" className="size-6" />
      </button>
      {open ? (
        <Suspense fallback={null}>
          <HelpSheet topic={topic ?? SCREEN_HELP[screen]} onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  )
}
