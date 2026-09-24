import type { BillCalendar, CalendarDay } from '@budget/core'
import { formatAmount, formatCents } from '../format.js'
import { cn } from '../lib/cn.js'

/** Sunday first, as the workbook's B6:N6 are. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/**
 * The workbook's Bill Calendar grid (B6:Q43), for a screen wide enough for names:
 * seven day columns, Sunday first, and each week's total in the last column
 * (Q8). A day shows its number, a green pill for each income source paid
 * that day (C8), and every bill on it with its amount (B9:C13), all as
 * plain text. A table, so a screen reader reads each day under its weekday.
 */
export function MonthGrid({ calendar, className }: { calendar: BillCalendar; className?: string }) {
  return (
    <table className={cn('w-full table-fixed border-collapse overflow-hidden rounded-xl bg-card text-sm shadow-sm', className)}>
      <caption className="caption-bottom bg-background px-4 pt-2 text-left text-xs text-muted-foreground">
        Bills and paydays by day, with each week’s total. Amounts in italics are planned: nothing has been charged for
        them yet this month.
      </caption>
      <thead>
        <tr>
          {WEEKDAYS.map((name) => (
            <th
              key={name}
              scope="col"
              className="border border-calendar-rule px-1 py-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-calendar-head xl:tracking-[0.25em]"
            >
              {/* The workbook spells them out letter by letter ("S U N D A Y"); spacing does it here, so a screen reader still says the day. */}
              {name}
            </th>
          ))}
          <th scope="col" className="w-24 border border-calendar-rule px-1 py-2 text-xs font-medium text-calendar-head">
            Week
          </th>
        </tr>
      </thead>
      <tbody>
        {calendar.weeks.map((week, i) => (
          <tr key={i}>
            {week.days.map((day, weekday) =>
              day === null ? (
                <td key={weekday} className="border border-calendar-rule bg-muted/40" />
              ) : (
                <td key={weekday} className="h-24 border border-calendar-rule p-1.5 align-top">
                  <GridDay day={day} />
                </td>
              ),
            )}
            <td className="border border-calendar-rule px-1.5 text-center align-middle">
              <span className="sr-only">Week total </span>
              <span className="tnum font-bold text-calendar-total">{formatCents(week.totalCents)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function GridDay({ day }: { day: CalendarDay }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-start justify-between gap-1">
        <span className="font-bold text-calendar-day">{day.day}</span>
        {day.paydays.map((p) => (
          <span key={p.categoryId} className="max-w-full truncate rounded-full bg-payday px-1.5 text-[0.6875rem] font-semibold text-payday-ink">
            <span className="sr-only">Payday: </span>
            {p.name}
          </span>
        ))}
      </div>
      {day.bills.map((b, i) => (
        <p key={`${b.categoryId}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-1 text-xs leading-tight text-calendar-ink">
          {/* On a narrow column the amount drops under the name rather than split it. */}
          <span className="max-w-full break-words">{b.name}</span>
          <span className={cn('tnum shrink-0', b.basis === 'planned' && 'italic')}>
            {formatAmount(b.amountCents)}
            {b.basis === 'planned' ? <span className="sr-only"> planned</span> : null}
          </span>
        </p>
      ))}
    </div>
  )
}

/**
 * The same month on a phone, whose seven columns have no room for names: a
 * day's number, green when someone is paid, and a dot for each bill. The
 * list under it says what each is, so this is a picture of it, hidden from
 * a screen reader, which reads the list.
 */
export function CompactGrid({ calendar, className }: { calendar: BillCalendar; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('rounded-xl border bg-card p-2 shadow-sm', className)}>
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
                      day.paydays.length > 0 ? 'bg-payday text-payday-ink' : 'text-calendar-day',
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
