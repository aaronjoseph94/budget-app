import type { BillCalendar, CalendarBill, CalendarDay } from '@budget/core'
import { formatAmount, formatCents, formatIsoDate } from '../format.js'
import { cn } from '../lib/cn.js'

/** Sunday first, as the workbook's B6:N6 are. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** Opens a bill's charges for the month (N51); without it a bill's name is only text. */
export type OpenBill = (bill: CalendarBill) => void

/**
 * A bill's name, as a button that opens its charges when there is a way to.
 * 44 px to a finger, as the Month's row names are, and never markup.
 */
export function BillName({ bill, onOpen, className }: { bill: CalendarBill; onOpen?: OpenBill | undefined; className?: string }) {
  if (onOpen === undefined) return <span className={className}>{bill.name}</span>
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => onOpen(bill)}
      className={cn(
        'rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11',
        className,
      )}
    >
      {bill.name}
    </button>
  )
}

/** A bill's rule in its list's hue (ADR 0010): sky Bills, violet Subscriptions, rose Debts. */
export const RULE: Record<CalendarBill['kind'], string> = {
  bill: 'border-bills-accent',
  subscription: 'border-subscriptions-accent',
  debt: 'border-debts-accent',
}

/** Opens a day with more on it than its cell shows (design-review P2 item 8). */
export type OpenDay = (day: CalendarDay, weekday: number) => void

/** Bills a cell shows before "+N more" (design-review P2 item 8). */
const SHOWN = 2

/**
 * The workbook's Bill Calendar grid (B6:Q43), for a screen wide enough for names:
 * seven day columns, Sunday first, and each week's total in the last column
 * (Q8). A day shows its number, a green pill for each income source paid
 * that day (C8), and its bills with their amounts (B9:C13), each on a rule
 * in its list's hue, all as plain text; after two, "+N more" opens the day.
 * Today is tinted. A table, so a screen reader reads each day under its weekday.
 */
export function MonthGrid({
  calendar,
  today,
  className,
  onOpen,
  onOpenDay,
}: {
  calendar: BillCalendar
  today: string
  className?: string
  onOpen?: OpenBill
  onOpenDay?: OpenDay
}) {
  const cell = 'border border-calendar-rule px-1 xl:px-3'
  return (
    <div className={cn('overflow-hidden rounded-xl border bg-card', className)}>
      {/* Its outer edges hidden, so the card's own edge is the only one. */}
      <table className="w-full table-fixed border-collapse text-sm [border-style:hidden]">
        <caption className="caption-bottom border-t px-4 py-3 text-left text-[0.8125rem] text-muted-foreground">
          Bills and paydays by day, with each week’s total. Amounts in italics are planned: nothing has been charged for
          them yet this month.
        </caption>
        <thead className="bg-calendar-band text-calendar-head">
          <tr>
            {WEEKDAYS.map((name) => (
              <th key={name} scope="col" className={cn(cell, 'py-2.5 text-left text-[0.625rem] font-semibold uppercase xl:text-xs xl:tracking-[0.08em]')}>
                {name}
              </th>
            ))}
            <th scope="col" className={cn(cell, 'w-24 py-2.5 text-right text-[0.625rem] font-semibold uppercase xl:w-28 xl:text-xs xl:tracking-[0.08em]')}>
              Week
            </th>
          </tr>
        </thead>
        <tbody>
          {calendar.weeks.map((week, i) => (
            <tr key={i}>
              {week.days.map((day, weekday) =>
                day === null ? (
                  <td key={weekday} className={cn(cell, 'bg-calendar-off')} />
                ) : (
                  <td
                    key={weekday}
                    aria-current={day.date === today ? 'date' : undefined}
                    className={cn(cell, 'h-28 py-2.5 align-top', day.date === today && 'bg-calendar-today')}
                  >
                    <GridDay day={day} today={day.date === today} onOpen={onOpen} onOpenDay={onOpenDay && (() => onOpenDay(day, weekday))} />
                  </td>
                ),
              )}
              <td className={cn(cell, 'text-right align-middle')}>
                <span className="sr-only">Week total </span>
                <span className="tnum font-bold text-calendar-total">{formatCents(week.totalCents)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GridDay({ day, today, onOpen, onOpenDay }: { day: CalendarDay; today: boolean; onOpen?: OpenBill | undefined; onOpenDay?: (() => void) | undefined }) {
  // Every bill when there is nowhere to open the day, so none is lost.
  const shown = onOpenDay === undefined ? day.bills : day.bills.slice(0, SHOWN)
  const more = day.bills.slice(shown.length)
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={cn('tnum font-semibold', today ? 'text-primary' : 'text-calendar-day')}>{day.day}</span>
        {day.paydays.map((p) => (
          <span key={p.categoryId} className="max-w-full truncate rounded-full bg-payday px-2 py-px text-[0.6875rem] font-semibold text-payday-ink">
            <span className="sr-only">Payday: </span>
            {p.name}
          </span>
        ))}
      </div>
      {shown.map((b, i) => (
        <p
          key={`${b.categoryId}-${i}`}
          className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-1.5 border-l-[3px] pl-1 text-xs leading-snug text-calendar-ink xl:pl-1.5 xl:text-[0.8125rem]', RULE[b.kind])}
        >
          {/* The name wraps beside its amount, never cut short, the same on
            every day: some days stacked them and some did not (V13). */}
          <BillName bill={b} onOpen={onOpen} className="min-w-0 [overflow-wrap:anywhere]" />
          <span className={cn('tnum shrink-0 text-muted-foreground', b.basis === 'planned' && 'italic')}>
            {formatAmount(b.amountCents)}
            {b.basis === 'planned' ? <span className="sr-only"> planned</span> : null}
          </span>
        </p>
      ))}
      {more.length > 0 && onOpenDay !== undefined ? (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onOpenDay}
          className="rounded-sm pl-2 text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
        >
          +{more.length} more <span className="sr-only">on {formatIsoDate(day.date)}</span>
        </button>
      ) : null}
    </div>
  )
}

/**
 * The same month on a phone, whose seven columns have no room for names: a
 * day's number, green when someone is paid, today's in the accent on its
 * tint, and a dot for each bill. The
 * list under it says what each is, so this is a picture of it, hidden from
 * a screen reader, which reads the list.
 */
export function CompactGrid({ calendar, today, className }: { calendar: BillCalendar; today: string; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('rounded-xl border bg-card p-2', className)}>
      <div className="grid grid-cols-7 text-center text-[0.6875rem] font-medium text-calendar-head">
        {WEEKDAYS.map((name) => (
          <span key={name} className="py-1">
            {name.slice(0, 1)}
          </span>
        ))}
      </div>
      {calendar.weeks.map((week, i) => (
        <div key={i} className="grid grid-cols-7 text-center">
          {week.days.map((day, weekday) => (
            <div key={weekday} className="flex h-12 flex-col items-center gap-1 pt-1">
              {day === null ? null : (
                <>
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-sm font-semibold',
                      day.paydays.length > 0 ? 'bg-payday text-payday-ink' : day.date === today ? 'bg-calendar-today text-primary' : 'text-calendar-day',
                    )}
                  >
                    {day.day}
                  </span>
                  <span className="flex gap-0.5">
                    {day.bills.slice(0, 4).map((b, j) => (
                      <span key={`${b.categoryId}-${j}`} className="size-1.5 rounded-full bg-calendar-ink" />
                    ))}
                    {day.bills.length > 4 ? <span className="text-[0.5rem] leading-[0.375rem] text-calendar-ink">+</span> : null}
                  </span>
                </>
              )}
            </div>
          ))}
        </div>
      ))}
      <p className="flex justify-center gap-4 pt-1 text-[0.6875rem] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-calendar-ink" /> a bill due
        </span>
        <span className="flex items-center gap-1">
          <span className="size-3 rounded-full bg-payday" /> payday
        </span>
      </p>
    </div>
  )
}
