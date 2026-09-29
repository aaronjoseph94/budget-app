import type { Screen } from '../nav.js'
import { cn } from '../lib/cn.js'

/** "Review, 3 waiting" to a screen reader, rather than the badge read as "Review3"; the Coach's dot as words. */
export function labelOf(t: { readonly screen: Screen; readonly label: string }, pendingTotal: number, dot: boolean): string {
  if (t.screen === 'coach' && dot) return `${t.label}, check-in ready`
  return t.screen === 'review' && pendingTotal > 0 ? `${t.label}, ${pendingTotal} waiting` : t.label
}

/** The Coach's dot: the Sunday check-in is ready (plan §2.1). Said in the tab's label, so hidden here. */
export function Dot({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('size-2 rounded-full bg-primary', className)} />
}

/** How many wait for review, in waiting's amber, as the Review banner is (design-review P1 item 4). */
export function Count({ n }: { n: number }) {
  return (
    <span className="tnum rounded-full bg-waiting-tile px-1.5 text-[10px] font-semibold leading-4 text-waiting-ink">
      {n > 99 ? '99+' : n}
    </span>
  )
}
