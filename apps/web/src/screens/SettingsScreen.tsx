import { useEffect, useId, useState } from 'react'
import { SPENDING_LISTS } from '@budget/core'
import { parseMoneyInput, readBudgetInput, useAppData } from '../app-data.js'
import { ensureCategory, saveGoal, setWeeklyBudget, type Category } from '../ledger.js'
import { formatForInput } from '../format.js'
import { atEndOf, groupByList, ListSelect, type CategoryKind } from '../lists.js'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Field, Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { useFunds } from '../funds.js'
import { HelpButton } from '../help/HelpButton.js'

export function SettingsScreen() {
  const { supabase, email } = useAppData()
  return (
    <div className="space-y-4">
      <header>
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <HelpButton screen="settings" />
        </div>
        <p className="text-sm text-muted-foreground">Budgets, your goal, and your account.</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Your lists</CardTitle>
          <CardDescription>Your name, and which list each category is on.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate('setup')}>
            <Icon name="list" /> Open Setup
          </Button>
        </CardContent>
      </Card>
      <BudgetsCard />
      <Goal />
      <Card>
        <CardHeader>
          <CardTitle as="h2">Account</CardTitle>
          <CardDescription>{email}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
            <Icon name="logout" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function BudgetsCard() {
  const { supabase, userId, categories, refresh } = useAppData()
  const [newName, setNewName] = useState('')
  // A weekly limit is for day-to-day spending, so that list comes first.
  const [newKind, setNewKind] = useState<CategoryKind | ''>('variable')
  const [error, setError] = useState<string | null>(null)
  // Only the lists the Week counts as spending take a weekly limit; one
  // stored on another list is left as it is, and not offered (N19).
  const lists = groupByList(categories).filter((g) => SPENDING_LISTS.includes(g.kind) && g.rows.length > 0)

  const add = async () => {
    const name = newName.trim()
    if (name === '' || newKind === '') return
    try {
      await ensureCategory(supabase, userId, atEndOf(categories, name, newKind))
      setNewName('')
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add it.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Weekly budgets</CardTitle>
        <CardDescription>
          A limit per category, per week, on the lists the Week counts as spending. Leave one blank for no limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error !== null ? <Alert tone="error">{error}</Alert> : null}
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No spending categories yet. They are created as you review transactions, or add one here.
          </p>
        ) : (
          lists.map((list) => (
            <section key={list.kind} aria-label={list.heading} className="space-y-1.5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{list.heading}</h3>
              <ul className="divide-y rounded-lg border">
                {list.rows.map((c) => (
                  <BudgetRow key={c.id} category={c} onError={setError} />
                ))}
              </ul>
            </section>
          ))
        )}
        <form
          className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_11rem_auto]"
          onSubmit={(e) => {
            e.preventDefault()
            void add()
          }}
        >
          <Input placeholder="New category" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} />
          <div className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-1">
            <ListSelect value={newKind} onChange={setNewKind} lists={SPENDING_LISTS} />
          </div>
          <Button type="submit" variant="outline" disabled={newName.trim() === '' || newKind === ''}>
            <Icon name="plus" /> Add
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">{refreshHint}</p>
      </CardContent>
    </Card>
  )
}

const refreshHint = 'Budgets save when you leave the field.'

function BudgetRow({ category, onError }: { category: Category; onError: (m: string | null) => void }) {
  const { supabase, refresh } = useAppData()
  const [text, setText] = useState(formatForInput(category.weekly_budget_cents))
  const [state, setState] = useState<'idle' | 'saved'>('idle')
  // What is wrong with what was typed, said on the field as the Week's
  // editor says it; a red border alone told a screen reader nothing (CR-5).
  const [problem, setProblem] = useState<string | null>(null)
  const problemId = useId()

  // Follow the stored budget when it changes, during render rather than in an
  // effect: a mount effect can run after the first keystroke and wipe it.
  const [shown, setShown] = useState(category.weekly_budget_cents)
  if (!Object.is(shown, category.weekly_budget_cents)) {
    setShown(category.weekly_budget_cents)
    setText(formatForInput(category.weekly_budget_cents))
  }

  const commit = async () => {
    const typed = text.trim() === '' ? null : readBudgetInput(text, 'weekly budget')
    if (typed !== null && 'problem' in typed) {
      setProblem(typed.problem)
      return
    }
    const cents = typed === null ? null : typed.cents
    if (cents === category.weekly_budget_cents) return
    try {
      await setWeeklyBudget(supabase, category.id, cents)
      setState('saved')
      onError(null)
      await refresh()
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'Could not save that budget.')
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{category.name}</span>
      {state === 'saved' ? <Icon name="check" className="size-4 text-income" /> : null}
      <div className="relative w-32">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        <Input
          inputMode="decimal"
          aria-label={`Weekly budget for ${category.name}`}
          placeholder="No limit"
          size="sm"
          inset
          className={`text-right ${problem !== null ? 'border-destructive' : ''}`}
          aria-invalid={problem !== null ? true : undefined}
          aria-describedby={problem !== null ? problemId : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setState('idle')
            setProblem(null)
          }}
          onBlur={() => void commit()}
        />
      </div>
      {problem !== null ? (
        <p id={problemId} role="alert" className="w-full text-xs text-destructive">
          {problem}
        </p>
      ) : null}
    </li>
  )
}

/**
 * The goal, or where it is kept now. A goal that has become a savings fund's
 * is edited on Savings only: its balance is written there with the day it
 * was true (N52), and this form, which types what is saved without a day,
 * would count every transfer since twice. While the funds load, or when
 * they cannot be read (0013 not applied), the form is as it was.
 */
function Goal() {
  const { mainGoal: goal } = useAppData()
  const funds = useFunds()
  const fund =
    goal === null || funds.status !== 'ready' ? undefined : funds.funds.funds.find((f) => f.figures?.goalId === goal.id)
  if (goal === null || fund === undefined) return <GoalForm />
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Icon name="plane" className="size-4" /> Your goal
        </CardTitle>
        <CardDescription>
          {goal.name} is now the goal of your {fund.name} savings fund, kept on Savings with the money you move into it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={() => navigate('savings')}>
          Edit it on Savings
        </Button>
      </CardContent>
    </Card>
  )
}

function GoalForm() {
  const { supabase, userId, mainGoal: goal, refresh } = useAppData()
  const [name, setName] = useState(goal?.name ?? 'Flight training')
  const [target, setTarget] = useState(goal === null ? '30000' : formatForInput(goal.target_cents))
  const [saved, setSaved] = useState(goal === null ? '0' : formatForInput(goal.saved_cents))
  const [date, setDate] = useState(goal?.target_date ?? '')
  const [unitCost, setUnitCost] = useState(goal === null ? '275' : formatForInput(goal.unit_cost_cents))
  const [unitLabel, setUnitLabel] = useState(goal?.unit_label ?? 'flight time')
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (goal === null) return
    setName(goal.name)
    setTarget(formatForInput(goal.target_cents))
    setSaved(formatForInput(goal.saved_cents))
    setDate(goal.target_date ?? '')
    setUnitCost(formatForInput(goal.unit_cost_cents))
    setUnitLabel(goal.unit_label ?? '')
  }, [goal])

  const targetCents = parseMoneyInput(target)
  const savedCents = saved.trim() === '' ? 0 : parseMoneyInput(saved)
  const unitCents = unitCost.trim() === '' ? null : parseMoneyInput(unitCost)
  const valid = name.trim() !== '' && targetCents !== null && targetCents > 0 && savedCents !== null && (unitCost.trim() === '' || unitCents !== null)

  const submit = async () => {
    if (!valid || targetCents === null || savedCents === null) return
    try {
      await saveGoal(supabase, userId, {
        name: name.trim(),
        targetCents,
        savedCents,
        targetDate: date === '' ? null : date,
        unitCostCents: unitCents,
        unitLabel: unitLabel.trim() === '' ? null : unitLabel.trim(),
      }, goal?.id ?? null)
      setOutcome({ ok: true, message: 'Saved.' })
      await refresh()
    } catch (cause) {
      setOutcome({ ok: false, message: cause instanceof Error ? cause.message : 'Could not save your goal.' })
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Icon name="plane" className="size-4" /> Your goal
        </CardTitle>
        <CardDescription>What you are saving toward. Shown on the week screen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="Name">
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Target ($)">
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <Field label="Saved so far ($)" hint="Update this when you move money in.">
              <Input inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
            </Field>
          </div>
          <Field label="Target date (optional)" hint="Shows how much to save each week to get there.">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cost per hour ($)" hint="Turns spending into time.">
              <Input inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
            <Field label="Called">
              <Input value={unitLabel} maxLength={40} onChange={(e) => setUnitLabel(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" className="w-full" disabled={!valid}>
            Save goal
          </Button>
          {outcome !== null ? <Alert tone={outcome.ok ? 'success' : 'error'}>{outcome.message}</Alert> : null}
        </form>
      </CardContent>
    </Card>
  )
}
