/**
 * The Coach's way into the Sunday check-in (plan §2.3): "Your Sunday
 * check-in is ready ●" until this week's has been opened on this device,
 * then "Your weekly check-in", so last week's is always one tap away.
 */
import { useMemo } from 'react'
import { checkinWeek, isoDate } from '@budget/core'
import { formatDateRange, todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { Icon } from '../components/ui/icons.js'
import { checkinDue } from './checkin-seen.js'

export function CheckinLink() {
  const { due, week } = useMemo(() => {
    const asOf = todayIso()
    return { due: checkinDue(asOf), week: checkinWeek({ asOf: isoDate(asOf) }) }
  }, [])
  return (
    <a
      href={hashOf({ screen: 'coach', param: 'checkin' })}
      className="flex min-h-11 items-center gap-3.5 rounded-xl border bg-linear-to-r from-card to-primary-tint p-4 text-card-foreground transition-colors hover:to-primary-soft md:px-5"
    >
      <span aria-hidden="true" className="hidden size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary min-[480px]:flex">
        <Icon name="check" className="size-[1.125rem]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold">
          {due ? 'Your Sunday check-in is ready' : 'Your weekly check-in'}
          {due ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
        </span>
        {/* On the accent's tint, muted words take `canvas-muted` (ADR 0010). */}
        <span className="block text-sm text-canvas-muted">The week of {formatDateRange(week.start, week.end)}</span>
      </span>
      <Icon name="chevronRight" className="size-5 shrink-0 text-canvas-muted" />
    </a>
  )
}
