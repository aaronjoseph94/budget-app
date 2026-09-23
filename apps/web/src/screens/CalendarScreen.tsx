import { useEffect, useMemo, useState } from 'react'
import { billCalendar, isoDate, monthBounds, shiftMonth, type BillCalendar } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPaySchedules, listPlanHistory, listTransactions, type LedgerRow, type PayScheduleRow, type PlanRow } from '../ledger.js'
import { navigate } from '../nav.js'
import { categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatCents, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'

/**
 * Workbook's Bill Calendar (S15c): a month's bills, debts and subscriptions on
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
      <header className="-mx-4 flex flex-wrap items-center justify-between gap-x-2 gap-y-3 bg-calendar-band px-4 py-4 md:mx-0 md:rounded-xl">
        <div>
          <MonthTitle>{formatMonthTitle(start)}</MonthTitle>
          <p className="mt-1 text-sm font-medium text-calendar-pill-ink">Bill calendar</p>
        </div>
        <div className="flex items-center gap-2">
          {calendar !== null && typeof calendar !== 'string' ? (
            <p className="rounded-full bg-calendar-pill px-3 py-1.5 text-calendar-pill-ink">
              <span className="sr-only">Due this month: </span>
              <Figure className="text-lg font-bold">{formatCents(calendar.totalCents)}</Figure>
            </p>
          ) : null}
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>

      {error !== null ? <Alert tone="error" title="Could not load this calendar">{error}</Alert> : null}
      {typeof calendar === 'string' ? <Alert tone="error" title="Could not show this calendar">{calendar}</Alert> : null}
      {/* A first load that failed is said above the screen, by App, as on the Month. */}
      {calendar === null && error === null && (version > 0 || loadError === null) ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}
    </div>
  )
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  readonly plans: readonly PlanRow[]
  readonly schedules: readonly PayScheduleRow[]
}
