import { useEffect, useRef, useState } from 'react'
import type { SavingsFund } from '@budget/core'
import { parseMoneyInput, useAppData } from '../app-data.js'
import { saveFund, type FundRow } from '../ledger.js'
import { formatForInput, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { Sheet } from '../components/ui/sheet.js'

/**
 * A fund's goal, typed where Workbook types it: the Goal Amount and Current
 * Amount on its card (Savings!B7, B5) and its Start and Goal Dates (N14,
 * R14). What is saved is typed as what the fund holds today, and filled in
 * with the balance core kept (D16); saving writes it with today as its day,
 * so transfers already counted are never counted again and later ones add
 * to it (N52). After a save the app's data is refreshed, which re-reads the
 * funds. A refusal that answers once the sheet has closed is handed to
 * `onFailedAfterClose`, so it is never lost.
 */
export function FundEditor({
  fund,
  goal,
  onClose,
  onSaved,
  onFailedAfterClose,
}: {
  fund: SavingsFund
  /** The fund's goal, or null to set one. */
  goal: FundRow | null
  onClose: () => void
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, refresh } = useAppData()
  const [target, setTarget] = useState(formatForInput(goal === null ? null : goal.target_cents))
  const [saved, setSaved] = useState(formatForInput(fund.figures === null ? null : fund.figures.balanceCents))
  const [start, setStart] = useState(goal?.start_date ?? '')
  const [end, setEnd] = useState(goal?.target_date ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useRef(true)
  useEffect(() => {
    open.current = true
    return () => {
      open.current = false
    }
  }, [])

  const submit = async () => {
    const goalCents = parseMoneyInput(target)
    const savedCents = saved.trim() === '' ? parseMoneyInput('0') : parseMoneyInput(saved)
    if (goalCents === null || goalCents <= 0) {
      setError('Type the goal as an amount above zero, like 2000 or 2,000.00.')
      return
    }
    if (savedCents === null || savedCents < 0) {
      setError('Type what is saved as an amount, like 150 or 150.00, or leave it empty for nothing yet.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveFund(
        supabase,
        { userId, categoryId: fund.categoryId, name: fund.name, goalId: goal === null ? null : goal.id },
        { goalCents, savedCents, asOf: todayIso(), startDate: start === '' ? null : start, goalDate: end === '' ? null : end },
      )
      onSaved(`${fund.name}'s goal is saved.`)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the goal. Nothing was saved.'
      if (!open.current) {
        onFailedAfterClose(`${fund.name}: ${message}`)
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  return (
    <Sheet title={goal === null ? `Set a goal for ${fund.name}` : `${fund.name}'s goal`} onClose={onClose}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Goal ($)">
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Saved today ($)" hint="Money moved in after today adds to it.">
            <Input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </Field>
        </div>
        {/* Savings!N14's note, and the callout over N13:R13. */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" hint="When you began saving for it.">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Goal date" hint="When you hope to reach it.">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {error !== null ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save goal'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
