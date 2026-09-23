import { useEffect, useMemo, useRef, useState } from 'react'
import { billsTotals, isoDate, resolvePlans, type BillsTotals, type ResolvedPlan } from '@budget/core'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { listPlanHistory, setPlan, type Category, type PlanRow } from '../ledger.js'
import { formatCents, formatForInput, formatMonthTitle } from '../format.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Figure } from '../components/ui/type.js'

/**
 * Workbook's Bills tab, inside Setup (plan §6.5, S9): a day paid and a monthly
 * amount on every Bills, Debts and Subscriptions row, from this month on
 * (D13), and the totals under them.
 */

/** Setup's monthly amounts: loading, refused with a sentence, or what core resolved for this month. */
export type MonthlyAmounts =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | {
      readonly status: 'ready'
      /** In effect this month, by category; a category never given one is absent. */
      readonly plans: ReadonlyMap<string, ResolvedPlan>
      /** Null while the categories and the amounts read disagree (see below). */
      readonly totals: BillsTotals | null
      /** They still disagree once both are current: said on screen, never hidden. */
      readonly mismatch: boolean
    }

/**
 * Every monthly amount typed up to `month`, re-read whenever the app's data
 * is (`version`), and resolved by core for that month.
 *
 * Categories and amounts are two reads. Removing a category removes its
 * amounts (0009), and for a moment the amounts read before it still name it,
 * which core refuses to total rather than leave a row out. So the totals wait
 * for the amounts read after the change; only if those still disagree is it
 * a fault worth saying. Nothing is read before the app's first load (version
 * 0): there are no categories yet, so every amount would disagree.
 */
export function useMonthlyAmounts(month: string): MonthlyAmounts {
  const { supabase, categories, version } = useAppData()
  const [loaded, setLoaded] = useState<{ month: string; version: number; rows: readonly PlanRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (version === 0) return
    let live = true
    listPlanHistory(supabase, month)
      .then((rows) => {
        if (!live) return
        setLoaded({ month, version, rows })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!live) return
        setLoaded(null)
        setError(e instanceof Error ? e.message : 'Your monthly amounts could not be read. Try again.')
      })
    return () => {
      live = false
    }
  }, [supabase, month, version])

  return useMemo((): MonthlyAmounts => {
    if (error !== null) return { status: 'failed', message: error }
    if (loaded === null || loaded.month !== month) return { status: 'loading' }
    const history = loaded.rows.map((r) => ({
      categoryId: r.category_id,
      effectiveMonth: isoDate(r.effective_month),
      plannedCents: r.planned_cents,
      dueDay: r.due_day,
    }))
    const asOf = isoDate(month)
    let plans: ReadonlyMap<string, ResolvedPlan>
    try {
      plans = new Map(resolvePlans({ asOf, history }).plans.map((p) => [p.categoryId, p]))
    } catch {
      // Core refuses what 0009 refuses; the database never sends it, so this
      // is a fault, said plainly and never as its message.
      return { status: 'failed', message: 'Your monthly amounts could not be shown. Reload to try again.' }
    }
    try {
      const totals = billsTotals({ month: asOf, categories: categories.map((c) => ({ id: c.id, kind: c.kind })), planHistory: history })
      return { status: 'ready', plans, totals, mismatch: false }
    } catch {
      return { status: 'ready', plans, totals: null, mismatch: loaded.version === version }
    }
  }, [error, loaded, month, categories, version])
}

/**
 * The two columns' headings, and short help from Workbook's notes on them
 * (Bills!B5 "Type the DAY of each month this repeat bill is paid!", D5 on a
 * yearly cost as a monthly one). The last sentence is the plan's (§10 item
 * 4): a yearly charge on the card replaces that month's amount (D5), so a
 * monthly share as well would count it about twice in the year.
 */
export function PlanHeadings({ month }: { month: string }) {
  const monthName = formatMonthTitle(month).split(' ')[0]
  return (
    <div className="mt-2 space-y-1 border-t border-owed-rule pt-2">
      <p className="grid grid-cols-[4.5rem_1fr] gap-2 text-xs font-medium text-owed-ink" aria-hidden="true">
        <span>Day paid</span>
        <span>Monthly amount (from {monthName} on)</span>
      </p>
      <p className="text-xs text-muted-foreground">
        The day of each month it is paid: the 5th is 5. A yearly cost can go in as a monthly share, $100 a year as
        $8.34 a month; if your card is charged for it once a year, leave the amount blank instead.
      </p>
    </div>
  )
}

/**
 * One of Workbook's total tiles (Bills!D32, H32, L32 and H36): the label on the
 * card's pink, the figure in Comfortaa beside it, from core's billsTotals.
 * To the cent (D8), where Workbook's "$"#,##0 shows Netflix's 17.99 as $18.
 */
export function TotalTile({ label, cents }: { label: string; cents: number }) {
  return (
    <dl className="flex overflow-hidden rounded-lg border border-owed-rule text-owed-ink">
      <dt className="flex items-center bg-owed-band px-3 py-2 text-sm font-medium">{label}</dt>
      <dd className="flex flex-1 items-center justify-end bg-card px-3 py-2">
        <Figure className="text-xl font-bold">{formatCents(cents)}</Figure>
      </dd>
    </dl>
  )
}

/** A day of the month typed by a person: a number, blank for none, or 'bad'. Not money. */
function parseDay(text: string): number | null | 'bad' {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (!/^\d{1,2}$/.test(trimmed)) return 'bad'
  const day = Number(trimmed)
  return day >= 1 && day <= 31 ? day : 'bad'
}

/**
 * A monthly amount typed by a person, through the parser statements use (as
 * the Month's budgets are): cents, blank for none, or 'bad', which includes
 * below zero, as 0009 refuses.
 */
function parseAmount(text: string): number | null | 'bad' {
  if (text.trim() === '') return null
  const cents = parseMoneyInput(text)
  return cents === null || cents < 0 ? 'bad' : cents
}

const DAY_HELP = 'Type the day of the month it is paid, 1 to 31, or leave it blank.'
const AMOUNT_HELP = 'Type the monthly amount as $0 or more, like 1600 or 17.99, or leave it blank.'

/**
 * A row's day paid and monthly amount, saved when a field is left.
 *
 * Every save writes both, from what the two fields hold, so leaving the day
 * and then the amount before the first save is read back cannot put the old
 * day back. Saves from one row go one after another, so the last one typed
 * is the one stored. The fields follow what is stored during render, as a
 * name does, so a save read back never undoes typing in the other field.
 */
export function PlanFields({
  row,
  plan,
  month,
  write,
  onSaved,
}: {
  row: Category
  /** What core says is in effect this month; undefined when none was ever set. */
  plan: ResolvedPlan | undefined
  /** This month's first day: a change applies from it on. */
  month: string
  write: (change: () => Promise<unknown>) => Promise<boolean>
  onSaved: (note: string) => void
}) {
  const { supabase, userId } = useAppData()
  const storedCents = plan === undefined ? null : plan.plannedCents
  const storedDay = plan === undefined ? null : plan.dueDay
  const shown = { day: storedDay === null ? '' : String(storedDay), amount: formatForInput(storedCents) }
  const [day, setDay] = useState(shown.day)
  const [amount, setAmount] = useState(shown.amount)
  const [was, setWas] = useState(shown)
  if (was.day !== shown.day || was.amount !== shown.amount) {
    if (was.day !== shown.day) setDay(shown.day)
    if (was.amount !== shown.amount) setAmount(shown.amount)
    setWas(shown)
  }
  const [problem, setProblem] = useState<string | null>(null)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const monthName = formatMonthTitle(month).split(' ')[0]

  const save = (cents: number | null, dueDay: number | null, note: string) => {
    setProblem(null)
    queue.current = queue.current.then(async () => {
      const edit = { userId, categoryId: row.id, month, plannedCents: cents, dueDay }
      if (await write(() => setPlan(supabase, edit))) onSaved(note)
      else {
        setDay(shown.day)
        setAmount(shown.amount)
      }
    })
  }

  // What each field holds now, or what is stored where it holds something
  // that cannot be saved; the field being left is checked on its own first.
  const dayNow = (): number | null => {
    const typed = parseDay(day)
    return typed === 'bad' ? storedDay : typed
  }
  const centsNow = (): number | null => {
    const typed = parseAmount(amount)
    return typed === 'bad' ? storedCents : typed
  }

  const commit = (field: 'day' | 'amount') => {
    if (field === 'day' && parseDay(day) === 'bad') {
      setProblem(DAY_HELP)
      return setDay(shown.day)
    }
    if (field === 'amount' && parseAmount(amount) === 'bad') {
      setProblem(AMOUNT_HELP)
      return setAmount(shown.amount)
    }
    const [cents, dueDay] = [centsNow(), dayNow()]
    if (cents === storedCents && dueDay === storedDay) return setProblem(null)
    const note =
      field === 'day'
        ? `${row.name}: ${dueDay === null ? 'no day paid' : `paid on day ${dueDay}`} from ${monthName} on.`
        : `${row.name}: ${cents === null ? 'no monthly amount' : `${formatCents(cents)} a month`} from ${monthName} on.`
    save(cents, dueDay, note)
  }

  return (
    <div className="pb-1 pl-1">
      <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
        <Input
          size="sm"
          inputMode="numeric"
          maxLength={2}
          aria-label={`Day paid for ${row.name}`}
          placeholder="Day"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          onBlur={() => commit('day')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="w-14 text-center"
        />
        <div className="flex items-center gap-2">
          <div className="relative w-36">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
            <Input
              size="sm"
              inset
              inputMode="decimal"
              aria-label={`Monthly amount for ${row.name}, from ${monthName} on`}
              placeholder="None"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => commit('amount')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="tnum"
            />
          </div>
          {storedCents === null ? null : (
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Stop ${row.name} from ${monthName}`}
              onClick={() => save(null, dayNow(), `${row.name}: no monthly amount from ${monthName} on.`)}
            >
              {/* A phone has room for the word alone; the headings above name the month. */}
              Stop<span className="hidden sm:inline">&nbsp;from {monthName}</span>
            </Button>
          )}
        </div>
      </div>
      {problem !== null ? (
        <p role="alert" className="mt-1 text-xs text-destructive">
          {problem}
        </p>
      ) : null}
      {/* F8: a blank day counts in a whole month, never in a week. */}
      {storedCents !== null && storedDay === null ? (
        <p className="mt-1 text-xs text-owed-ink">Add a day paid so this shows in weeks.</p>
      ) : null}
    </div>
  )
}
