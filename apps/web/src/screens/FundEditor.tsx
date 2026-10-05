import { useState } from 'react'
import { goalAtEnd, type SavingsFund } from '@budget/core'
import { parseMoneyInput, placedGoal, tooLargeInput, useAppData } from '../app-data.js'
import { saveFund, type FundRow } from '../ledger.js'
import { formatForInput, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { Sheet } from '../components/ui/sheet.js'
import { GoalUnitFields, readUnit, unitText } from './GoalUnitFields.js'
import { useStillOpen } from '../lib/still-open.js'

/**
 * A fund's goal, typed where the workbook types it: the Goal Amount and Current
 * Amount on its card (Savings!B7, B5) and its Start and Goal Dates (N14,
 * R14); and whether its progress shows in dollars or in hours (F45). What
 * is saved is typed as what the fund holds today, and filled in
 * with the balance core kept (D16); once retyped, saving writes it with today
 * as its day, so transfers already counted are never counted again and later
 * ones add to it (N52). Left as filled in, it is not written at all, so a
 * transfer dated before today that reaches the ledger later still counts
 * (backend-c1-01). After a save the app's data is refreshed, which re-reads the
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
  /** The fund the goal is for, or, for a goal on no fund, its name and figures with no category. */
  fund: Pick<SavingsFund, 'name' | 'figures'> & { readonly categoryId: string | null }
  /** The fund's goal, or null to set one. */
  goal: FundRow | null
  onClose: () => void
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, goals, goalsOrdered, refresh } = useAppData()
  const [target, setTarget] = useState(formatForInput(goal === null ? null : goal.target_cents))
  const [saved, setSaved] = useState(formatForInput(fund.figures === null ? null : fund.figures.balanceCents))
  const [savedTouched, setSavedTouched] = useState(false)
  const [start, setStart] = useState(goal?.start_date ?? '')
  const [end, setEnd] = useState(goal?.target_date ?? '')
  const [unit, setUnit] = useState(unitText(goal))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useStillOpen()

  const submit = async () => {
    const goalCents = parseMoneyInput(target)
    const savedCents = saved.trim() === '' ? parseMoneyInput('0') : parseMoneyInput(saved)
    if (goalCents === null || goalCents <= 0) {
      setError(tooLargeInput(target) ?? 'Type the goal as an amount above zero, like 2000 or 2,000.00.')
      return
    }
    if (savedCents === null || savedCents < 0) {
      setError(tooLargeInput(saved) ?? 'Type what is saved as an amount, like 150 or 150.00, or leave it empty for nothing yet.')
      return
    }
    const inUnit = readUnit(unit)
    if ('problem' in inUnit) {
      setError(inUnit.problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveFund(
        supabase,
        {
          userId,
          categoryId: fund.categoryId,
          name: fund.name,
          goalId: goal === null ? null : goal.id,
          // After every goal, as Add a goal and Resume place one: written
          // with no place it took 0 and could become the main goal (e2e-money-01).
          ...(goal === null && goalsOrdered ? goalAtEnd({ goals: goals.map(placedGoal) }) : {}),
        },
        {
          goalCents,
          saved: goal === null || savedTouched ? { cents: savedCents, asOf: todayIso() } : null,
          startDate: start === '' ? null : start,
          goalDate: end === '' ? null : end,
          ...inUnit,
        },
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
          <Field
            label="Saved today ($)"
            hint={fund.categoryId === null ? 'Update this when you move money in.' : 'Money moved in after today adds to it.'}
          >
            <Input
              inputMode="decimal"
              value={saved}
              onChange={(e) => {
                setSaved(e.target.value)
                setSavedTouched(true)
              }}
            />
          </Field>
        </div>
        {/* Savings!N14's note, and the callout over N13:R13. */}
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <Field label="Start date" hint="When you began saving for it.">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Goal date" hint="When you hope to reach it.">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <GoalUnitFields unit={unit} onChange={setUnit} />
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
