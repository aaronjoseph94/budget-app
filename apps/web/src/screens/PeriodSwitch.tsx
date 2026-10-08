import type { KeyboardEvent } from 'react'
import { hashOf, type Screen } from '../nav.js'
import { cn } from '../lib/cn.js'
import { arrowIndex } from '../lib/roving.js'

/** The three everyday views of the same budget, shortest period first (ADR 0014). */
const VIEWS: readonly { screen: Screen; label: string }[] = [
  { screen: 'week', label: 'Week' },
  { screen: 'month', label: 'Month' },
  { screen: 'year', label: 'Year' },
]

/** Moves focus along the switch's links with the arrow keys, Home and End. */
function onArrow(e: KeyboardEvent<HTMLAnchorElement>) {
  const links = [...(e.currentTarget.parentElement?.querySelectorAll('a') ?? [])]
  const at = links.indexOf(e.currentTarget)
  const to = arrowIndex(e.key, at, links.length)
  if (to === null) return
  e.preventDefault()
  links[to]?.focus()
}

/**
 * Week · Month · Year, at the top of those three screens, so the Week
 * stays one tap from the Month after it left the phone's bar for the Coach.
 * Paycheck had a fourth segment until the owner's decision of 2026-10-08
 * (ADR 0014): it is its own screen under Plan now, beside the Bill calendar.
 *
 * Each is a link to that view's bare address, so it opens as it does from
 * anywhere else (this week, this month, this year): a month has no one
 * week to carry across. At large text sizes the row scrolls inside its
 * own box rather than the page sideways, its right edge fading while there
 * is more to see (edge-fade, index.css).
 *
 * Mockup A's segmented control: the three on the canvas grey, the one
 * showing lifted onto the card. Words on the canvas take `canvas-muted`,
 * as #6b7280 reads 4.40 to one there (ADR 0010).
 *
 * The arrow keys, Home and End move along the three, as the Add screen's
 * tabs do (design review, Accessibility); Enter opens the one reached. Each
 * stays a link in the tab order, so nothing is lost to a keyboard without them.
 */
export function PeriodSwitch({ current }: { current: 'week' | 'month' | 'year' }) {
  return (
    <nav aria-label="Views" className="edge-fade -mx-1 overflow-x-auto px-1">
      <div className="grid w-full min-w-max grid-cols-3 gap-1 rounded-md bg-canvas p-1 sm:inline-grid sm:w-auto">
        {VIEWS.map((v) => (
          <a
            key={v.screen}
            href={hashOf({ screen: v.screen, param: null })}
            aria-current={v.screen === current ? 'page' : undefined}
            onKeyDown={onArrow}
            className={cn(
              // 8 px a side below 640 px, so "Month" fits 64 px; with four
              // segments, 14 px made each 72 and ran "Year" under the fade (e2e-plan-11).
              'flex min-h-9 min-w-16 items-center justify-center rounded-sm px-2 text-sm font-medium transition-colors pointer-coarse:min-h-11 sm:min-w-22 sm:px-3.5',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              v.screen === current ? 'bg-card text-foreground shadow-sm' : 'text-canvas-muted hover:text-foreground',
            )}
          >
            {v.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
