import { useState } from 'react'
import { goalAtEnd } from '@budget/core'
import { parseMoneyInput, placedGoal, useAppData } from '../app-data.js'
import { addGoal } from '../goal-writes.js'
import { atEndOf, LIST_HEADING } from '../lists.js'
import { todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { Sheet } from '../components/ui/sheet.js'
import { GoalUnitFields, readUnit, unitText, type UnitText } from './GoalUnitFields.js'
import { useStillOpen } from '../lib/still-open.js'

/** What Add a goal opens with filled in, all of it changeable first: Getting started's flight goal (plan §8.1). */
export interface GoalPreset {
  readonly name?: string
  readonly target?: string
  readonly unit?: UnitText
}

/**
 * Add a savings goal (G1): its name, target, what is saved already, if
 * wanted a date, and whether to show its progress in dollars or in hours
 * of something (F45). Saving makes the goal's fund, a Savings-list category
 * of the same name at the bottom of the list, or uses the Savings fund of
 * that name when there is one without a goal, and links the goal to it with
 * what is saved true as of today, so money moved into it from tomorrow on
 * adds to it (D16). The new goal goes after every other (F45); before 0015
 * there is no place to write, and it is added as the goals were before.
 */
export function AddGoalSheet({
  preset = {},
  goalOnFund,
  onClose,
  onSaved,
  onFailedAfterClose,
}: {
  preset?: GoalPreset
  /** The ids of the funds that already have a goal: a fund takes one goal (0013). */
  goalOnFund: ReadonlySet<string>
  onClose: () => void
  onSaved: (note: string) => void
  onFailedAfterClose: (message: string) => void
}) {
  const { supabase, userId, categories, goals, goalsOrdered, refresh } = useAppData()
  const [name, setName] = useState(preset.name ?? '')
  const [target, setTarget] = useState(preset.target ?? '')
  const [saved, setSaved] = useState('')
  const [date, setDate] = useState('')
  const [unit, setUnit] = useState(preset.unit ?? unitText(null))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useStillOpen()

  const submit = async () => {
    const named = name.trim()
    const targetCents = parseMoneyInput(target)
    const savedCents = saved.trim() === '' ? parseMoneyInput('0') : parseMoneyInput(saved)
    const inUnit = readUnit(unit)
    // Said before anything is written, in the words of what went wrong.
    const taken = categories.find((c) => c.name === named)
    const problem =
      goals.some((g) => g.name === named)
        ? `You already have a goal called ${named}. Edit it on its card, or use another name.`
        : taken !== undefined && taken.kind !== 'savings'
          ? `${named} is on your ${LIST_HEADING[taken.kind]} list. Use another name, or move it to Savings in Setup.`
          : taken !== undefined && goalOnFund.has(taken.id)
            ? `Your ${named} fund already has a goal. Edit it on its card, or use another name.`
            : targetCents === null || targetCents <= 0
              ? 'Type the target as an amount above zero, like 2000 or 2,000.00.'
              : savedCents === null || savedCents < 0
                ? 'Type what is saved as an amount, like 150 or 150.00, or leave it empty for nothing yet.'
                : 'problem' in inUnit
                  ? inUnit.problem
                  : null
    if (problem !== null || targetCents === null || savedCents === null || 'problem' in inUnit) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await addGoal(supabase, userId, atEndOf(categories, named, 'savings'), {
        name: named,
        targetCents,
        savedCents,
        targetDate: date === '' ? null : date,
        // Saving for it starts the day it is added, so its card can say what
        // a month needs (F21); with no date there is nothing to divide by.
        startDate: date === '' ? null : todayIso(),
        ...inUnit,
        asOf: todayIso(),
        sortOrder: goalsOrdered ? goalAtEnd({ goals: goals.map(placedGoal) }).sortOrder : null,
      })
      onSaved(`${named} is added, with its fund on your Savings list. Money you move into it after today adds to it.`)
      await refresh()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not add the goal. Nothing was saved.'
      if (!open.current) {
        onFailedAfterClose(`${named}: ${message}`)
        return
      }
      setError(message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Add a goal" subtitle="Anything you are saving for. It gets its own fund on your Savings list." onClose={onClose}>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field label="Name">
          <Input value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target ($)">
            <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Saved already ($)" hint="Optional.">
            <Input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
          </Field>
        </div>
        <Field label="Target date" hint="Optional. With a date, the card shows what to save each month to get there.">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <GoalUnitFields unit={unit} onChange={setUnit} />
        {error !== null ? <Alert tone="error">{error}</Alert> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || name.trim() === ''}>
            {busy ? 'Adding…' : 'Add goal'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
