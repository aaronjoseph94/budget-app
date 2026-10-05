import type { Screen } from '../nav.js'
import { cn } from '../lib/cn.js'

/**
 * The focus ring the README keeps (--ring, the accent), for the shell's own
 * controls. Inside the sidebar it is drawn inside the control: the list
 * scrolls, and a ring outside an item would be cut off at its edges.
 */
export const RING = 'outline-none focus-visible:ring-[3px] focus-visible:ring-ring'
export const RING_INSET = 'outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

/** "Review, 3 waiting, 2 suggested" to a screen reader, rather than the badges read as "Review32"; the Coach's dot as words. */
export function labelOf(t: { readonly screen: Screen; readonly label: string }, pendingTotal: number, dot: boolean, suggestedTotal = 0): string {
  if (t.screen === 'coach' && dot) return `${t.label}, check-in ready`
  if (t.screen !== 'review') return t.label
  return [t.label, ...(pendingTotal > 0 ? [`${pendingTotal} waiting`] : []), ...(suggestedTotal > 0 ? [`${suggestedTotal} suggested`] : [])].join(', ')
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

/** How many changes an AI app suggested wait in Review (ADR 0013), in the accent, beside the waiting count; "N suggested" where there is room. */
export function Suggested({ n, words = false }: { n: number; words?: boolean }) {
  return (
    <span className="tnum rounded-full bg-primary-soft px-1.5 text-[10px] font-semibold leading-4 whitespace-nowrap text-primary">
      {n > 99 ? '99+' : n}
      {words ? ' suggested' : ''}
    </span>
  )
}
