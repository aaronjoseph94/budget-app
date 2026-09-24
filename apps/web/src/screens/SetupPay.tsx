import { useEffect, useId, useRef, useState } from 'react'
import { isoDate } from '@budget/core'
import { useAppData } from '../app-data.js'
import { listPaySchedules, removePaySchedule, setPaySchedule, type Category, type PayFrequency, type PayScheduleRow } from '../ledger.js'
import { formatIsoDate } from '../format.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'

/**
 * When each income source pays, inside Setup's Income card: START HERE's
 * first pay date and frequency (C8:C14, E8:E14), stored in 0011. The
 * Paycheck view finds its pay period from them (F15 B).
 */

/** Setup's pay schedules: loading, refused with a sentence, or by income source. */
export type PaySchedules =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'ready'; readonly byCategory: ReadonlyMap<string, PayScheduleRow> }

/** Every pay schedule, re-read whenever the app's data is (`version`), not before its first load. */
export function usePaySchedules(): PaySchedules {
  const { supabase, version } = useAppData()
  const [state, setState] = useState<PaySchedules>({ status: 'loading' })
  useEffect(() => {
    if (version === 0) return
    let live = true
    listPaySchedules(supabase, 'read')
      .then((rows) => live && setState({ status: 'ready', byCategory: new Map(rows.map((r) => [r.category_id, r])) }))
      .catch((e: unknown) => {
        if (live) setState({ status: 'failed', message: e instanceof Error ? e.message : 'When you are paid could not be read.' })
      })
    return () => {
      live = false
    }
  }, [supabase, version])
  return state
}

/** START HERE!E8's list, in its words. */
export const FREQUENCY_WORD: Readonly<Record<PayFrequency, string>> = {
  weekly: 'Weekly',
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
}
const FREQUENCIES: readonly PayFrequency[] = ['weekly', 'biweekly', 'monthly']

/** The two columns' headings, and Workbook's note on them (START HERE!C7, E7), shortened. */
export function PayHeadings() {
  return (
    <div className="mt-2 space-y-1 border-t border-income-rule pt-2">
      <p className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 text-xs font-medium text-income-ink" aria-hidden="true">
        <span>Paid</span>
        <span>First payday</span>
      </p>
      <p className="text-xs text-muted-foreground">
        How often it pays, and one day it paid. The Paycheck view counts its pay periods from them. Leave both blank
        if it pays at no set time.
      </p>
    </div>
  )
}

/** A date typed or picked, as an ISO date, or null when it is not one. */
function readDate(text: string): string | null {
  try {
    return isoDate(text)
  } catch {
    return null
  }
}

/**
 * An income row's schedule, saved once both halves are there, and removed
 * once both are blank. Saves from one row go one after another, so the last
 * one made is the one stored. The fields follow what is stored during
 * render, as Setup's other fields do.
 */
export function PayFields({
  row,
  stored,
  write,
  onSaved,
}: {
  row: Category
  stored: PayScheduleRow | undefined
  write: (change: () => Promise<unknown>) => Promise<boolean>
  onSaved: (note: string) => void
}) {
  const { supabase, userId } = useAppData()
  const shown = { frequency: stored === undefined ? '' : stored.frequency, date: stored === undefined ? '' : stored.first_pay_date }
  const [frequency, setFrequency] = useState(shown.frequency)
  const [date, setDate] = useState(shown.date)
  const [was, setWas] = useState(shown)
  if (was.frequency !== shown.frequency || was.date !== shown.date) {
    setFrequency(shown.frequency)
    setDate(shown.date)
    setWas(shown)
  }
  const [problem, setProblem] = useState<string | null>(null)
  const problemId = useId()
  // Every message here is about the pair, so both fields carry it (FE-8).
  const refused = problem === null ? {} : { 'aria-invalid': true, 'aria-describedby': problemId }
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const commit = (nextFrequency: string, nextDate: string) => {
    const often = FREQUENCIES.find((f) => f === nextFrequency)
    const day = readDate(nextDate)
    if (nextDate !== '' && day === null) return setProblem('Pick a date for the first payday, or leave it blank.')
    if (often === shown.frequency && day === shown.date) return setProblem(null)
    if (often === undefined && day === null) {
      setProblem(null)
      if (stored === undefined) return
      return run(() => removePaySchedule(supabase, row.id), `${row.name}: no set payday.`)
    }
    if (often === undefined || day === null) return setProblem('Pick both how often it pays and a first payday to save it.')
    setProblem(null)
    const edit = { userId, categoryId: row.id, firstPayDate: day, frequency: often }
    run(() => setPaySchedule(supabase, edit), `${row.name}: paid ${FREQUENCY_WORD[often].toLowerCase()}, from ${formatIsoDate(day)}.`)
  }
  const run = (change: () => Promise<unknown>, note: string) => {
    queue.current = queue.current.then(async () => {
      if (await write(change)) onSaved(note)
      else {
        setFrequency(shown.frequency)
        setDate(shown.date)
      }
    })
  }

  return (
    <div className="pb-1 pl-1">
      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-2">
        <NativeSelect
          aria-label={`How often ${row.name} pays`}
          {...refused}
          value={frequency}
          onChange={(e) => {
            setFrequency(e.target.value)
            commit(e.target.value, date)
          }}
          className="h-9 text-sm"
        >
          <option value="">Not set</option>
          {FREQUENCIES.map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_WORD[f]}
            </option>
          ))}
        </NativeSelect>
        {/* Shrinks on a phone rather than push Clear past the card. */}
        <div className="flex min-w-0 items-center gap-1">
          <Input
            size="sm"
            type="date"
            aria-label={`First payday for ${row.name}`}
            {...refused}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            onBlur={() => commit(frequency, date)}
            className="min-w-0 flex-1 px-2 text-sm [color-scheme:light_dark] sm:w-40 sm:flex-none"
          />
          {stored === undefined ? null : (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground"
              aria-label={`Clear when ${row.name} pays`}
              onClick={() => {
                setFrequency('')
                setDate('')
                commit('', '')
              }}
            >
              <Icon name="x" />
            </Button>
          )}
        </div>
      </div>
      {problem !== null ? (
        <p id={problemId} role="alert" className="mt-1 text-xs text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
