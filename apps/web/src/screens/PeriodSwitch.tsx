import { hashOf, type Screen } from '../nav.js'
import { cn } from '../lib/cn.js'

/** The four views of the same budget, in the order the workbook's tabs run (ADR 0006). */
const VIEWS: readonly { screen: Screen; label: string }[] = [
  { screen: 'month', label: 'Month' },
  { screen: 'week', label: 'Week' },
  { screen: 'paycheck', label: 'Pay' },
  { screen: 'year', label: 'Year' },
]

/**
 * Month · Week · Pay · Year, at the top of those four screens, so the Week
 * stays one tap from the Month after it left the phone's bar for the Coach.
 *
 * Each is a link to that view's bare address, so it opens as it does from
 * anywhere else (this month, this week, this pay period, this year): a
 * month has no one week or pay period to carry across. Four segments are
 * about 72px each at 320px; at large text sizes the row scrolls inside its
 * own box rather than the page sideways.
 */
export function PeriodSwitch({ current }: { current: 'month' | 'week' | 'paycheck' | 'year' }) {
  return (
    <nav aria-label="Views" className="-mx-1 overflow-x-auto px-1">
      <div className="grid w-full min-w-max grid-cols-4 gap-1 rounded-lg bg-muted p-1 md:max-w-md">
        {VIEWS.map((v) => (
          <a
            key={v.screen}
            href={hashOf({ screen: v.screen, param: null })}
            aria-current={v.screen === current ? 'page' : undefined}
            className={cn(
              'flex min-h-11 min-w-16 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors',
              'outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
              v.screen === current ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {v.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
