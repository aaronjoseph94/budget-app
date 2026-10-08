import { useEffect, useMemo, useState } from 'react'
import { billCalendar, isoDate, monthBounds, shiftMonth, type BillCalendar, type CalendarBill, type CalendarDay } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPaySchedules, listPlanHistory, listTransactions, type LedgerRow, type PayScheduleRow, type PlanRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatCents, formatDateRange, formatIsoDate, formatMonthTitle, formatShortMonth } from '../format.js'
import { Alert, Loading } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Sheet } from '../components/ui/sheet.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { BillName, CompactGrid, MonthGrid, RULE, WEEKDAYS, type OpenBill } from './CalendarGrid.js'
import { MonthCharges } from './MonthCharges.js'
import { StepButton } from './MonthScreen.js'
import { LIST_HEADING } from '../lists.js'
import { HelpButton } from '../help/HelpButton.js'
import { TryAgain } from '../try-again.js'

/**
 * The workbook's Bill Calendar (S15c): a month's bills, debts and subscriptions on
 * the days they are due or were charged, who is paid which day, and a total
 * for each week and the month. `month` is the address's `YYYY-MM`, or null
 * for this month; the arrows step through shiftMonth, as the Month's do.
 *
 * Every number is billCalendar's, from packages/core: a real charge in the
 * month in place of that bill's monthly amount (D5), paydays from Income
 * rows' pay schedules. This screen lays them out. Names are plain text.
 */
export function CalendarScreen({ month }: { month: string | null }) {
  const { supabase, categories, loadError, version, today } = useAppData()
  const { start, end } = monthBounds(isoDate(month === null ? today : `${month}-01`))
  const step = (months: number) => navigate('calendar', shiftMonth(start, months).slice(0, 7))
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The bill whose charges are open; another month closes it (N51).
  const [opened, setOpened] = useState<CalendarBill | null>(null)
  // The day whose bills did not all fit its cell, open in a sheet.
  const [day, setDay] = useState<{ day: CalendarDay; weekday: number } | null>(null)
  useEffect(() => {
    setOpened(null)
    setDay(null)
  }, [start])

  useEffect(() => {
    // As on the Month: nothing is read before the first load brings the
    // categories, which core needs to place every row it is given (N35).
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      listPlanHistory(supabase, start, 'calendar'),
      listPaySchedules(supabase, 'calendar'),
    ])
      .then(([rows, plans, schedules]) => live && setLoaded({ start, rows, plans, schedules }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this calendar.'))
    return () => {
      live = false
    }
  }, [supabase, start, end, version])

  // A month's rows only ever fill that month: while the next one loads, the
  // screen waits rather than show last month's bills under this title.
  const here = loaded !== null && loaded.start === start ? loaded : null
  const calendar = useMemo((): BillCalendar | string | null => {
    if (here === null) return null
    try {
      return billCalendar({
        month: start,
        categories: categoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore(here.rows),
        paySchedules: here.schedules.map((s) => ({
          categoryId: s.category_id,
          firstPayDate: isoDate(s.first_pay_date),
          frequency: s.frequency,
        })),
      })
    } catch {
      return 'A charge, a monthly amount or a payday this month names a category that did not load, so the calendar is not shown.'
    }
  }, [here, categories, start])

  return (
    <div className="space-y-4">
      {/* Mockup A's title row, as on the Month: the title with its ?, the
        screen's name under it, and on the right the month's pill and the
        stepper. Everything wraps, so a phone drops them under the title. */}
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>{formatMonthTitle(start)}</MonthTitle>
            <HelpButton screen="calendar" className="text-muted-foreground" />
          </div>
          <p className="mt-1 text-base text-muted-foreground">Bill calendar</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {calendar !== null && typeof calendar !== 'string' ? (
            // Named on the pill, not only to a screen reader: the workbook's J3 sits
            // under its own heading, and a bare figure said nothing.
            <p className="flex flex-col items-end rounded-lg bg-calendar-pill px-3.5 py-2 leading-tight text-calendar-pill-ink">
              <span className="text-xs font-medium">Due this month</span>
              <span className="sr-only">: </span>
              <Figure className="text-xl font-bold">{formatCents(calendar.totalCents)}</Figure>
            </p>
          ) : null}
          <div className="flex items-stretch rounded-md border bg-card">
            <StepButton label="Previous month" icon="chevronLeft" onClick={() => step(-1)} />
            <span className="tnum flex items-center border-x px-3.5 text-[0.9375rem] font-medium whitespace-nowrap">{formatShortMonth(start)}</span>
            <StepButton label="Next month" icon="chevronRight" onClick={() => step(1)} />
          </div>
        </div>
      </header>

      {error !== null ? <Alert tone="error" title="Could not load this calendar">{error}</Alert> : null}
      {typeof calendar === 'string' ? <Alert tone="error" title="Could not show this calendar">{calendar} <TryAgain />.</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {calendar === null && error === null && (version > 0 || loadError === null) ? (
        <Loading what="this calendar" />
      ) : null}

      {calendar !== null && typeof calendar !== 'string' ? (
        <>
          {/* Phones get the month as a picture with the list under it; a
            wider screen has room for the workbook's grid, names and all. */}
          <CompactGrid calendar={calendar} today={today} className="md:hidden" />
          <MonthGrid calendar={calendar} today={today} className="hidden md:block" onOpen={setOpened} onOpenDay={(d, weekday) => setDay({ day: d, weekday })} />
          <Agenda calendar={calendar} className="md:hidden" onOpen={setOpened} />
          <Undated calendar={calendar} />
        </>
      ) : null}
      {day !== null ? (
        <Sheet title={formatIsoDate(day.day.date)} subtitle="Bill calendar" onClose={() => setDay(null)}>
          {/* The day as the agenda lists it; a bill opens its charges in place of the day. */}
          <ul>
            <AgendaDay
              day={day.day}
              weekday={day.weekday}
              onOpen={(bill) => {
                setDay(null)
                setOpened(bill)
              }}
            />
          </ul>
        </Sheet>
      ) : null}
      {here !== null && opened !== null ? <BillCharges bill={opened} month={start} rows={here.rows} onClose={() => setOpened(null)} /> : null}
    </div>
  )
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  readonly plans: readonly PlanRow[]
  readonly schedules: readonly PayScheduleRow[]
}

/**
 * The calendar as a list, a week at a time: each day with something on it,
 * its bills and who is paid, and the week's total (the workbook's Q8).
 */
function Agenda({ calendar, className, onOpen }: { calendar: BillCalendar; className?: string; onOpen: OpenBill }) {
  return (
    <div className={cn('space-y-3', className)}>
      {calendar.weeks.map((week) => {
        const days = week.days.flatMap((d, weekday) => (d === null ? [] : [{ d, weekday }]))
        const first = days[0]
        const last = days[days.length - 1]
        if (first === undefined || last === undefined) return null
        const busy = days.filter(({ d }) => d.bills.length > 0 || d.paydays.length > 0)
        const range = formatDateRange(first.d.date, last.d.date)
        return (
          <section key={first.d.date} aria-label={`Week of ${range}`} className="rounded-xl border bg-card">
            <h2 className="flex items-baseline justify-between gap-2 border-b border-calendar-rule px-4 py-2.5 text-sm">
              <span className="font-medium text-calendar-day">{range}</span>
              <span className="tnum font-bold text-calendar-total">
                <span className="sr-only">Week total </span>
                {formatCents(week.totalCents)}
              </span>
            </h2>
            {busy.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Nothing due.</p>
            ) : (
              <ul className="divide-y">
                {busy.map(({ d, weekday }) => (
                  <AgendaDay key={d.date} day={d} weekday={weekday} onOpen={onOpen} />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

function AgendaDay({ day, weekday, onOpen }: { day: CalendarDay; weekday: number; onOpen: OpenBill }) {
  return (
    <li className="flex gap-3 px-4 py-2.5">
      <span className="w-10 shrink-0 text-center leading-tight text-calendar-day">
        <span className="block text-xs">{WEEKDAYS[weekday]?.slice(0, 3)}</span>
        <span className="block text-lg font-bold">{day.day}</span>
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {day.paydays.map((p) => (
          <span key={p.categoryId} className="mr-1 inline-block rounded-full bg-payday px-2 py-0.5 text-xs font-semibold text-payday-ink">
            {p.name} payday
          </span>
        ))}
        {day.bills.map((b, i) => (
          // The amount drops under the name, and "planned" under the amount,
          // when they do not fit, as with the phone's text at 200% (N58).
          <p
            key={`${b.categoryId}-${i}`}
            className={cn('flex flex-wrap items-baseline justify-between gap-x-3 border-l-[3px] pl-2 text-sm text-calendar-ink', RULE[b.kind])}
          >
            <BillName bill={b} onOpen={onOpen} className="min-w-0 truncate" />
            <span className="ml-auto max-w-full text-right">
              <span className="tnum whitespace-nowrap">{formatCents(b.amountCents)}</span>
              {b.basis === 'planned' ? <> <span className="text-xs text-muted-foreground">planned</span></> : null}
            </span>
          </p>
        ))}
      </div>
    </li>
  )
}

/**
 * A bill's charges in the calendar's month, in the Month's sheet, each with
 * Move to… (N51). Its amount is the calendar's for that bill: the charge, or
 * the monthly amount while nothing is charged (D5).
 */
function BillCharges({ bill, month, rows, onClose }: { bill: CalendarBill; month: string; rows: readonly LedgerRow[]; onClose: () => void }) {
  return (
    <MonthCharges
      name={bill.name}
      heading={LIST_HEADING[bill.kind]}
      month={month}
      actualCents={bill.amountCents}
      basis={bill.basis}
      charges={rows.filter((r) => r.category_id === bill.categoryId)}
      onClose={onClose}
    />
  )
}

/** Monthly amounts with no day paid: on no day and in no total (F20), so said. */
function Undated({ calendar }: { calendar: BillCalendar }) {
  if (calendar.undated.length === 0) return null
  return (
    <section aria-label="No day paid" className="space-y-2.5 rounded-xl border bg-card p-4 md:px-6 md:py-5">
      <h2 className="text-lg font-semibold">No day paid</h2>
      <p className="text-muted-foreground">
        These have a monthly amount but no day paid, so they are not on the calendar or in its totals. The Month still counts them.
      </p>
      <ul className="text-calendar-ink">
        {calendar.undated.map((b) => (
          <li key={b.categoryId} className="flex justify-between gap-3 border-t py-2">
            <span className="min-w-0 truncate">{b.name}</span>
            <span className="tnum shrink-0">{formatCents(b.amountCents)}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => navigate('settings', 'lists')}>
        Add a day paid in Lists
      </Button>
    </section>
  )
}
