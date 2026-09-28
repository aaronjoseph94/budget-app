import { useEffect, useMemo, useState } from 'react'
import { billCalendar, isoDate, monthBounds, shiftMonth, type BillCalendar, type CalendarBill, type CalendarDay } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPaySchedules, listPlanHistory, listTransactions, type LedgerRow, type PayScheduleRow, type PlanRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatCents, formatDateRange, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { BillName, CompactGrid, MonthGrid, WEEKDAYS, type OpenBill } from './CalendarGrid.js'
import { MonthCharges } from './MonthCharges.js'
import { LIST_HEADING } from '../lists.js'
import { HelpButton } from '../help/HelpButton.js'

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
  const { supabase, categories, loadError, version } = useAppData()
  const { start, end } = monthBounds(isoDate(month === null ? todayIso() : `${month}-01`))
  const step = (months: number) => navigate('calendar', shiftMonth(start, months).slice(0, 7))
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The bill whose charges are open; another month closes it (N51).
  const [opened, setOpened] = useState<CalendarBill | null>(null)
  useEffect(() => setOpened(null), [start])

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
      return 'A charge, a monthly amount or a payday this month names a category that did not load, so the calendar is not shown. Reload to try again.'
    }
  }, [here, categories, start])

  return (
    <div className="space-y-4">
      <header className="-mx-4 max-[359px]:-mx-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-3 bg-calendar-band px-4 max-[359px]:px-3 py-4 md:mx-0 md:rounded-xl">
        <div>
          <MonthTitle>{formatMonthTitle(start)}</MonthTitle>
          <p className="mt-1 text-sm font-medium text-calendar-pill-ink">Bill calendar</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {calendar !== null && typeof calendar !== 'string' ? (
            // Named on the pill, not only to a screen reader: the workbook's J3 sits
            // under its own heading, and a bare figure in the band said nothing.
            <p className="flex flex-col rounded-2xl bg-calendar-pill px-3 py-1 leading-tight text-calendar-pill-ink">
              <span className="text-[11px] font-medium">Due this month</span>
              <span className="sr-only">: </span>
              <Figure className="text-lg font-bold">{formatCents(calendar.totalCents)}</Figure>
            </p>
          ) : null}
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
          {/* With the buttons, as on the Month, so the title keeps its line. */}
          <HelpButton screen="calendar" />
        </div>
      </header>

      {error !== null ? <Alert tone="error" title="Could not load this calendar">{error}</Alert> : null}
      {typeof calendar === 'string' ? <Alert tone="error" title="Could not show this calendar">{calendar}</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {calendar === null && error === null && (version > 0 || loadError === null) ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {calendar !== null && typeof calendar !== 'string' ? (
        <>
          {/* Phones get the month as a picture with the list under it; a
            wider screen has room for the workbook's grid, names and all. */}
          <CompactGrid calendar={calendar} className="md:hidden" />
          <MonthGrid calendar={calendar} className="hidden md:table" onOpen={setOpened} />
          <Agenda calendar={calendar} className="md:hidden" onOpen={setOpened} />
          <Undated calendar={calendar} />
        </>
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
export function Agenda({ calendar, className, onOpen }: { calendar: BillCalendar; className?: string; onOpen?: OpenBill }) {
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
          <section key={first.d.date} aria-label={`Week of ${range}`} className="rounded-xl border bg-card shadow-sm">
            <h2 className="flex items-baseline justify-between gap-2 border-b border-calendar-rule px-4 py-2.5 text-sm">
              <span className="font-medium text-calendar-day">{range}</span>
              <span className="tnum font-semibold text-calendar-total">
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

function AgendaDay({ day, weekday, onOpen }: { day: CalendarDay; weekday: number; onOpen?: OpenBill | undefined }) {
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
          <p key={`${b.categoryId}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-calendar-ink">
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
    <section aria-label="No day paid" className="space-y-2 rounded-xl border bg-card p-4 text-sm shadow-sm">
      <h2 className="font-medium">No day paid</h2>
      <p className="text-muted-foreground">
        These have a monthly amount but no day paid, so they are not on the calendar or in its totals. The Month still counts them.
      </p>
      <ul className="space-y-1 text-calendar-ink">
        {calendar.undated.map((b) => (
          <li key={b.categoryId} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">{b.name}</span>
            <span className="tnum shrink-0">{formatCents(b.amountCents)}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" onClick={() => navigate('setup')}>
        Add a day paid in Setup
      </Button>
    </section>
  )
}
