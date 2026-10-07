import { useState } from 'react'
import { goalAtEnd, goalsProgress, type SavingsFund } from '@budget/core'
import { parseMoneyInput, placedGoal, tooLargeInput, useAppData } from '../app-data.js'
import { saveFund, type FundRow } from '../ledger.js'
import { removeGoal } from '../goal-writes.js'
import { formatCents, formatForInput, todayIso } from '../format.js'
import { LIST_HEADING } from '../lists.js'
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
 * `onFailedAfterClose`, so it is never lost. Editing also renames the goal
 * (and its fund, when it has one); Remove is offered here as on Debts, and
 * only when nothing is saved (F45).
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
  const { supabase, userId, categories, goals, goalsOrdered, refresh } = useAppData()
  const [name, setName] = useState(fund.name)
  const [target, setTarget] = useState(formatForInput(goal === null ? null : goal.target_cents))
  const [saved, setSaved] = useState(formatForInput(fund.figures === null ? null : fund.figures.balanceCents))
  const [savedTouched, setSavedTouched] = useState(false)
  const [start, setStart] = useState(goal?.start_date ?? '')
  const [end, setEnd] = useState(goal?.target_date ?? '')
  const [unit, setUnit] = useState(unitText(goal))
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useStillOpen()
  const balanceCents = fund.figures?.balanceCents ?? 0
  const [progress] = goalsProgress({
    goals: [{ id: goal?.id ?? 'new', targetCents: goal?.target_cents ?? 1, savedCents: balanceCents, unitCostCents: null }],
  }).goals

  const write = async (action: () => Promise<void>, done: string, failLabel: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved(done)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not save the goal. Nothing was saved.'
      if (!open.current) {
        onFailedAfterClose(`${failLabel}: ${message}`)
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  const submit = async () => {
    const named = name.trim()
    const goalCents = parseMoneyInput(target)
    const savedCents = saved.trim() === '' ? parseMoneyInput('0') : parseMoneyInput(saved)
    const taken = categories.find((c) => c.name === named)
    const problem =
      named === ''
        ? 'Give the goal a name.'
        : goals.some((g) => g.name === named && g.id !== goal?.id)
          ? `You already have a goal called ${named}. Use another name.`
          : taken !== undefined && taken.id !== fund.categoryId && taken.kind !== 'savings'
            ? `${named} is on your ${LIST_HEADING[taken.kind]} list. Use another name, or move it to Savings in Setup.`
            : taken !== undefined && taken.id !== fund.categoryId
              ? `You already have a Savings fund called ${named}. Use another name.`
              : goalCents === null || goalCents <= 0
                ? (tooLargeInput(target) ?? 'Type the goal as an amount above zero, like 2000 or 2,000.00.')
                : savedCents === null || savedCents < 0
                  ? (tooLargeInput(saved) ??
                    'Type what is saved as an amount, like 150 or 150.00, or leave it empty for nothing yet.')
                  : null
    if (problem !== null) {
      setError(problem)
      return
    }
    const inUnit = readUnit(unit)
    if ('problem' in inUnit) {
      setError(inUnit.problem)
      return
    }
    if (goalCents === null || savedCents === null) return
    await write(
      () =>
        saveFund(
          supabase,
          {
            userId,
            categoryId: fund.categoryId,
            name: named,
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
        ),
      `${named}'s goal is saved.`,
      named,
    )
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
        {goal === null ? null : (
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        )}
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
        {goal === null || !removing ? null : progress === undefined || !progress.empty ? (
          <p role="alert" className="rounded-lg border px-3 py-2 text-sm">
            {fund.name} holds {formatCents(balanceCents)}, so removing it would lose the record of that balance. Pause it or mark it
            reached instead. If that money is gone, set Saved today to 0, save, then remove it.
          </p>
        ) : (
          <p className="rounded-lg border px-3 py-2 text-sm">
            Remove {fund.name}?{fund.categoryId !== null ? ' Its fund stays on your Savings list, with everything filed under it.' : ''}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {goal === null ? null : (
            <>
              {removing && progress !== undefined && progress.empty ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void write(
                      () => removeGoal(supabase, goal.id),
                      `Removed ${fund.name}.${fund.categoryId !== null ? ' Its fund stays on your Savings list; remove it in Setup if you no longer need it.' : ''}`,
                      fund.name,
                    )
                  }
                >
                  Remove {fund.name}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setRemoving((was) => !was)}>
                {removing ? 'Keep it' : 'Remove…'}
              </Button>
            </>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
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
