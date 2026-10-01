import { Suspense, lazy, useId, useState } from 'react'
import { SPENDING_LISTS } from '@budget/core'
import { readBudgetInput, useAppData } from '../app-data.js'
import { ensureCategory, setWeeklyBudget, type Category } from '../ledger.js'
import { formatForInput } from '../format.js'
import { atEndOf, groupByList, ListSelect, type CategoryKind } from '../lists.js'
import { MonthTitle } from '../components/ui/type.js'
import { Section } from '../forecast/parts.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input, refusal } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { HelpButton } from '../help/HelpButton.js'
import { LearnedShopsCard } from './LearnedShops.js'
import { AiAppsCard } from '../ai-apps/AiAppsCard.js'

const ProgressLine = lazy(() => import('../start/ProgressLine.js').then((m) => ({ default: m.ProgressLine })))

export function SettingsScreen() {
  const { supabase, email } = useAppData()
  // Mockup A: the three shortcuts across from 1024px, then Weekly budgets
  // beside the learned shops, AI apps and the account from 1280px.
  return (
    <div className="space-y-5">
      <header>
        <div className="flex flex-wrap items-center gap-1">
          <MonthTitle>Settings</MonthTitle>
          <HelpButton screen="settings" />
        </div>
        <p className="text-muted-foreground md:text-base">Budgets, your savings goals, and your account.</p>
      </header>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section large title="Getting started">
          <p className="text-muted-foreground">
            <Suspense fallback="One step at a time">
              <ProgressLine fallback="One step at a time" />
            </Suspense>
          </p>
          <Button variant="outline" onClick={() => navigate('start')}>
            <Icon name="check" /> Open Getting started
          </Button>
        </Section>
        <Section large title="Your lists">
          <p className="text-muted-foreground">Your name, and which list each category is on.</p>
          <Button variant="outline" onClick={() => navigate('setup')}>
            <Icon name="list" /> Open Setup
          </Button>
        </Section>
        <GoalsCard />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <BudgetsCard />
        <div className="space-y-5">
          <LearnedShopsCard />
          <AiAppsCard />
          <Section large title="Account">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* An address is one long word: it breaks only where it cannot fit. */}
              <p className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{email}</p>
              <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
                <Icon name="logout" /> Sign out
              </Button>
            </div>
          </Section>
        </div>
      </div>
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
    <Section large title="Weekly budgets">
      <p className="text-muted-foreground">
        A limit per category, per week, on the lists the Week counts as spending. Leave one blank for no limit.
      </p>
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
        <div className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
          <ListSelect value={newKind} onChange={setNewKind} lists={SPENDING_LISTS} />
        </div>
        <Button type="submit" variant="outline" disabled={newName.trim() === '' || newKind === ''}>
          <Icon name="plus" /> Add
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{refreshHint}</p>
    </Section>
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
          {...refusal(problemId, problem !== null)}
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
 * Where the savings goals are kept (G1): Savings, where each is added,
 * edited, ordered, paused and finished. This card once edited the one goal
 * itself; the goal it saved is left exactly as it is, and Savings shows
 * and edits it.
 */
function GoalsCard() {
  const { goals, mainGoal } = useAppData()
  const count = goals.length === 1 ? 'One goal' : `${goals.length} goals`
  return (
    <Section large title="Your savings goals">
      <p className="text-muted-foreground">
        {goals.length === 0
          ? 'None yet. Add one on Savings: flight training, a trip, a rainy-day fund.'
          : mainGoal === null
            ? goals.length === 1
              ? 'Your one goal is paused or reached. Resume it on Savings.'
              : `Your ${goals.length} goals are all paused or reached. Resume one on Savings.`
            : `${count}. Your main goal is ${mainGoal.name}, which the Coach and the Week show.`}
      </p>
      <Button variant="outline" onClick={() => navigate('savings')}>
        Open Savings
      </Button>
    </Section>
  )
}
