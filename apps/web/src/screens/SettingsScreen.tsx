import { Suspense, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { lazyPart } from '../lib/lazy-part.js'
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
import { SETTINGS_TAB_HELP } from '../help/screen-help.js'
import { LearnedShopsCard } from './LearnedShops.js'
import { AiAppsCard } from '../ai-apps/AiAppsCard.js'
import { signOutHere } from '../sign-out.js'
import { cn } from '../lib/cn.js'
import { arrowIndex } from '../lib/roving.js'
import { SETTINGS_TABS, SETTINGS_TAB_NAME, rememberSettingsTab, rememberedSettingsTab, type SettingsTab } from '../settings/tab.js'

// The two big tabs are fetched when first shown, as the screens were (PERF-3).
const ListsTab = lazyPart(() => import('../settings/ListsTab.js').then((m) => ({ default: m.ListsTab })))
const AiTab = lazyPart(() => import('../settings/AiTab.js').then((m) => ({ default: m.AiTab })))

/**
 * Settings (ADR 0014 §2): one screen, four tabs. Lists is the workbook's
 * START HERE; Budgets & goals the weekly budgets, and where the goals are;
 * AI is AI settings; Account the learned shops, AI apps and Sign out. The
 * tab showing is in the address (`#/settings/ai`); bare, it opens the tab
 * last seen on this device, as Reports does.
 */
export function SettingsScreen({ tab }: { tab: SettingsTab | null }) {
  const shown = tab ?? rememberedSettingsTab()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (tab !== null) rememberSettingsTab(tab)
  }, [tab])
  // The arrow keys, Home and End choose along the tabs, as Reports' do.
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const to = arrowIndex(e.key, SETTINGS_TABS.indexOf(shown), SETTINGS_TABS.length)
    const next = to === null ? undefined : SETTINGS_TABS[to]
    if (to === null || next === undefined) return
    e.preventDefault()
    navigate('settings', next)
    buttons.current[to]?.focus()
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-1">
        <MonthTitle>Settings</MonthTitle>
        <HelpButton screen="settings" topic={SETTINGS_TAB_HELP[shown]} />
      </header>
      {/* Mockup A's segmented control, as Reports draws it; the columns take
        their own widths, so all four fit a phone. One tab stop, the chosen one. */}
      <div className="edge-fade -mx-1 overflow-x-auto px-1">
        <div role="tablist" aria-label="Settings" className="grid w-full grid-cols-[repeat(4,auto)] gap-1 rounded-md bg-canvas p-1 sm:inline-grid sm:w-auto">
          {SETTINGS_TABS.map((t, i) => (
            <button
              key={t}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              role="tab"
              aria-selected={shown === t}
              aria-controls={`settings-${t}`}
              id={`settings-tab-${t}`}
              tabIndex={shown === t ? 0 : -1}
              onClick={() => navigate('settings', t)}
              onKeyDown={onKey}
              className={cn(
                'min-h-11 rounded-sm px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring sm:min-w-22 sm:px-4',
                shown === t ? 'bg-card text-foreground shadow-sm' : 'text-canvas-muted hover:text-foreground',
              )}
            >
              {SETTINGS_TAB_NAME[t]}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" id={`settings-${shown}`} aria-labelledby={`settings-tab-${shown}`}>
        <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>}>
          {shown === 'lists' ? <ListsTab /> : shown === 'ai' ? <AiTab /> : shown === 'account' ? <AccountTab /> : <BudgetsTab />}
        </Suspense>
      </div>
    </div>
  )
}

/** Weekly budgets beside the goals from 1280px (Mockup A). */
function BudgetsTab() {
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <BudgetsCard />
      <GoalsCard />
    </div>
  )
}

/** The learned shops beside AI apps and the account from 1280px. */
function AccountTab() {
  const { supabase, email } = useAppData()
  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
      <LearnedShopsCard />
      <div className="space-y-5">
        <AiAppsCard />
        <Section large title="Account">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* An address is one long word: it breaks only where it cannot fit. */}
            <p className="min-w-0 text-muted-foreground [overflow-wrap:anywhere]">{email}</p>
            <Button variant="outline" onClick={() => void signOutHere(supabase)}>
              <Icon name="logout" /> Sign out
            </Button>
          </div>
        </Section>
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
    // Why the last one was refused goes with the next try, as on Setup's cards (e2e-setup-07).
    setError(null)
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
      <p className="text-sm text-muted-foreground">Budgets save when you leave the field.</p>
    </Section>
  )
}

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
