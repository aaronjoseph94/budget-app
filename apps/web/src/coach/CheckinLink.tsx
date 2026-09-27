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
      className="flex min-h-11 items-center gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-muted/60"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-medium">
          {due ? 'Your Sunday check-in is ready' : 'Your weekly check-in'}
          {due ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" /> : null}
        </span>
        <span className="block text-sm text-muted-foreground">The week of {formatDateRange(week.start, week.end)}</span>
      </span>
      <Icon name="chevronRight" className="size-5 shrink-0 text-muted-foreground" />
    </a>
  )
}
