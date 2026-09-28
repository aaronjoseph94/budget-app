import { useState, type ReactNode } from 'react'
import { useAppData } from '../app-data.js'
import { appendToLists, isoDate, monthBounds, moveInList, type BillNudge, type BillsTotals } from '@budget/core'
import {
  addCategories,
  ensureCategory,
  moveCategory,
  removeCategory,
  renameCategory,
  setCategoryOrder,
  type Category,
} from '../ledger.js'
import { atEndOf, groupByList, LIST_HEADING, LISTS, starterList, type CategoryKind } from '../lists.js'
import { saveDisplayName } from '../profile.js'
import { formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { PlanFields, PlanHeadings, TotalTile, useMonthlyAmounts, type MonthlyAmounts } from './SetupPlans.js'
import { useBillNudges } from '../bill-nudges.js'
import { PayFields, PayHeadings, usePaySchedules, type PaySchedules } from './SetupPay.js'
import { HelpButton } from '../help/HelpButton.js'

interface ListCard {
  readonly kind: CategoryKind
  /** The column heading the workbook puts on the card, emoji and all (START HERE row 7 and 17). */
  readonly header?: readonly [emoji: string, text: string]
  /** Short help, from the note the workbook attaches to the card's heading cell. */
  readonly hint: string
}

/**
 * START HERE's layout: section labels, and under each one its cards, in the
 * order the workbook has them. "Not spending" is the app's own and comes last.
 */
const SECTIONS: readonly { readonly label: string; readonly cards: readonly ListCard[] }[] = [
  { label: 'Income', cards: [{ kind: 'income', header: ['💵', 'Source'], hint: 'What type of income do you receive?' }] },
  { label: 'Savings', cards: [{ kind: 'savings', hint: 'What are your savings goals?' }] },
  {
    label: 'Recurring expenses',
    cards: [
      { kind: 'bill', header: ['🏠', 'Bills'], hint: 'What bills do you pay each month? Their amounts usually stay the same.' },
      {
        kind: 'debt',
        header: ['💳', 'Debts'],
        // The workbook's note (D17) invites every open credit line; the second
        // sentence is the plan's (§3.3), so the Rogers card is not put here.
        hint: 'What loans are you paying off from the bank? A card you pay off from your bank is not a monthly debt payment here — its purchases are already counted.',
      },
      { kind: 'subscription', header: ['💻', 'Subscriptions'], hint: 'What are you subscribed to? A statement shows them.' },
    ],
  },
  { label: 'Variable expenses', cards: [{ kind: 'variable', hint: 'What transactions have varied amounts?' }] },
  {
    label: 'Not spending',
    cards: [{ kind: 'transfer', hint: 'Money that only moves, like paying off your card. Never counted as spending or income.' }],
  },
]

/**
 * Setup: the workbook's START HERE tab. Your name, and every category under the
 * list it belongs to, which decides where its charges are counted.
 */
export function SetupScreen() {
  const { categories, version } = useAppData()
  const lists = new Map(groupByList(categories).map((group) => [group.kind, group.rows]))
  // How many the starter button added, kept here so its message stays once
  // the button itself is gone.
  const [added, setAdded] = useState<number | null>(null)
  // Monthly amounts are set from this month on (D13), as the workbook's Bills tab
  // sets one for every month.
  const month = monthBounds(isoDate(todayIso())).start
  const amounts = useMonthlyAmounts(month)
  const nudges = useBillNudges(amounts)
  const schedules = usePaySchedules()

  return (
    <div className="-mx-4 bg-setup-canvas pb-6 md:mx-0 md:overflow-hidden md:rounded-xl">
      <NameBand />
      <div className="space-y-6 px-4 pt-5">
        {/* Not before the first load, when every account reads as empty. */}
        {version > 0 && categories.length < FEW_CATEGORIES ? <StarterCard onAdded={setAdded} /> : null}
        {added !== null ? <StarterAdded count={added} /> : null}
        {SECTIONS.map((section) => (
          <section key={section.label} className="space-y-2">
            <h2 className="text-xl font-medium text-setup-label">{section.label}</h2>
            {section.label === 'Recurring expenses' ? <AmountsProblem amounts={amounts} /> : null}
            {section.label === 'Income' && schedules.status === 'failed' ? <Alert tone="error">{schedules.message}</Alert> : null}
            {section.cards.map((card) => (
              <ListCardView
                key={card.kind}
                card={card}
                rows={lists.get(card.kind) ?? []}
                month={month}
                amounts={RECURRING.has(card.kind) ? amounts : null}
                nudges={nudges}
                schedules={card.kind === 'income' ? schedules : null}
              />
            ))}
            {section.label === 'Recurring expenses' ? <FixedTotal amounts={amounts} month={month} /> : null}
          </section>
        ))}
      </div>
    </div>
  )
}

/**
 * Setup's own cards for some of the lists, as Getting started shows them
 * one step at a time (plan §8.1): the same editors, reading and saving
 * exactly as Setup does. With `starter`, the starter list's offer first.
 */
export function SetupLists({ kinds, starter = false }: { kinds: readonly CategoryKind[]; starter?: boolean }) {
  const { categories, version } = useAppData()
  const lists = new Map(groupByList(categories).map((group) => [group.kind, group.rows]))
  const [added, setAdded] = useState<number | null>(null)
  const month = monthBounds(isoDate(todayIso())).start
  const amounts = useMonthlyAmounts(month)
  const nudges = useBillNudges(amounts)
  const schedules = usePaySchedules()
  const cards = SECTIONS.flatMap((section) => section.cards).filter((card) => kinds.includes(card.kind))
  return (
    <div className="space-y-3">
      {starter && version > 0 && categories.length < FEW_CATEGORIES ? <StarterCard onAdded={setAdded} /> : null}
      {added !== null ? <StarterAdded count={added} /> : null}
      {kinds.some((k) => RECURRING.has(k)) ? <AmountsProblem amounts={amounts} /> : null}
      {kinds.includes('income') && schedules.status === 'failed' ? <Alert tone="error">{schedules.message}</Alert> : null}
      {cards.map((card) => (
        <ListCardView
          key={card.kind}
          card={card}
          rows={lists.get(card.kind) ?? []}
          month={month}
          amounts={RECURRING.has(card.kind) ? amounts : null}
          nudges={nudges}
          schedules={card.kind === 'income' ? schedules : null}
        />
      ))}
    </div>
  )
}

/** The lists with the workbook's Day Paid and Monthly Amount columns (Bills!B:D, F:H, J:L). */
const RECURRING: ReadonlySet<CategoryKind> = new Set(['bill', 'debt', 'subscription'])

/** The tile under each recurring card, and the total its list adds to (Bills!D32, H32, L32). */
const CARD_TOTAL: Readonly<Partial<Record<CategoryKind, { label: string; field: keyof BillsTotals }>>> = {
  bill: { label: 'Bills total', field: 'billsCents' },
  debt: { label: 'Debts total', field: 'debtsCents' },
  subscription: { label: 'Subscriptions total', field: 'subscriptionsCents' },
}

/**
 * The workbook's "Fixed Monthly Bills" tile (Bills!H36), under the three cards. It
 * adds all three lists: the workbook's formula reads an empty cell for the third
 * and drops the subscriptions (D7), so the line under it says what is in it.
 */
function FixedTotal({ amounts, month }: { amounts: MonthlyAmounts; month: string }) {
  if (amounts.status !== 'ready' || amounts.totals === null) return null
  return (
    <section aria-label="Fixed monthly bills" className="space-y-1 pt-1">
      <TotalTile label="Fixed monthly bills" cents={amounts.totals.allFixedCents} />
      <p className="text-xs text-muted-foreground">Bills, debts and subscriptions together, in {formatMonthTitle(month)}.</p>
    </section>
  )
}

/** Why monthly amounts are not shown, once, above the three cards that would show them. */
function AmountsProblem({ amounts }: { amounts: MonthlyAmounts }) {
  if (amounts.status === 'failed') return <Alert tone="error">{amounts.message}</Alert>
  if (amounts.status === 'ready' && amounts.mismatch) {
    return (
      <Alert tone="error">
        A monthly amount names a category that did not load, so the totals are not shown. Reload to try again.
      </Alert>
    )
  }
  return null
}

/**
 * Below this many categories, Setup offers the starter names. The starter list is 31
 * names, so once it has been added the offer is gone; someone who has
 * already built lists of their own is not asked.
 */
const FEW_CATEGORIES = 20

/** "Use the starter list": every list filled with names to rename (plan §7). */
function StarterCard({ onAdded }: { onAdded: (count: number) => void }) {
  const { supabase, userId, categories, mainGoal, refresh } = useAppData()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setMessage(null)
    const { rows } = appendToLists({
      existing: categories.map((c) => ({ name: c.name, kind: c.kind, sortOrder: c.sort_order })),
      wanted: starterList(mainGoal === null ? null : mainGoal.name),
    })
    try {
      onAdded(await addCategories(supabase, userId, rows))
      await refresh()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Nothing was added. Check your connection and try again.')
    }
    setBusy(false)
  }

  return (
    <section aria-label="Starter list" className="rounded-xl bg-card px-4 py-4 shadow-sm">
      <p className="text-sm">
        Fill your lists with example names — Rent, Groceries, Netflix and the rest — plus Card payments and
        Card interest &amp; fees for your statement. Names you already have stay as they are.
      </p>
      {message !== null ? (
        <div className="mt-2">
          <Alert tone="error">{message}</Alert>
        </div>
      ) : null}
      <Button className="mt-3" disabled={busy} onClick={() => void start()}>
        Use the starter list
      </Button>
    </section>
  )
}

/** What the starter button did, and that the names are only placeholders. */
function StarterAdded({ count }: { count: number }) {
  if (count === 0) {
    return <Alert tone="success">Everything on the starter list is already here, so nothing was added.</Alert>
  }
  return (
    <Alert tone="success" title={`Added ${count} example ${count === 1 ? 'name' : 'names'}`}>
      They are placeholders. Rename each one to your own, move any to another list, and remove the ones you don&apos;t
      need. None of them has an amount.
    </Alert>
  )
}

/** The teal band: "Start here!" and "My name is ___". */
function NameBand() {
  const { supabase, displayName } = useAppData()
  const [name, setName] = useState(displayName)
  const [saved, setSaved] = useState(displayName)
  const [state, setState] = useState<'idle' | 'saved'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const commit = async () => {
    const trimmed = name.trim()
    if (trimmed === saved) return
    try {
      await saveDisplayName(supabase, trimmed)
      setSaved(trimmed)
      setState('saved')
      setMessage(null)
    } catch (cause) {
      setState('idle')
      setMessage(cause instanceof Error ? cause.message : 'Your name was not saved.')
    }
  }

  return (
    <header className="bg-setup-band px-4 pb-5 pt-3 text-white">
      <button
        type="button"
        onClick={() => navigate('more')}
        className="-ml-1 mb-2 rounded px-1 text-sm text-setup-band-ink/90 outline-none pointer-coarse:min-h-11 pointer-coarse:min-w-11 focus-visible:ring-2 focus-visible:ring-white/70"
      >
        ‹ More
      </button>
      <div className="flex items-center gap-1">
        <h1 className="font-serif text-4xl italic">Start here!</h1>
        <HelpButton screen="setup" />
      </div>
      <label className="mt-4 flex items-baseline gap-3 text-setup-band-ink">
        <span className="shrink-0 text-sm italic">My name is</span>
        <input
          value={name}
          maxLength={60}
          autoComplete="given-name"
          onChange={(e) => {
            setName(e.target.value)
            setState('idle')
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 border-b border-white/80 bg-transparent pb-1 italic pointer-coarse:min-h-11 text-setup-band-ink outline-none placeholder:text-setup-band-ink/60 focus-visible:border-white"
          placeholder="your first name"
        />
        {state === 'saved' ? <Icon name="check" className="size-4 shrink-0" aria-label="Saved" /> : null}
      </label>
      {message !== null ? (
        <div className="mt-3">
          <Alert tone="error">{message}</Alert>
        </div>
      ) : null}
    </header>
  )
}

function ListCardView({
  card,
  rows,
  month,
  amounts,
  nudges,
  schedules,
}: {
  card: ListCard
  rows: readonly Category[]
  /** This month's first day. */
  month: string
  /** On Bills, Debts and Subscriptions only; null on the other lists. */
  amounts: MonthlyAmounts | null
  /** "Looks like a monthly bill", by category (F38). */
  nudges: ReadonlyMap<string, BillNudge>
  /** On Income only; null on the other lists. */
  schedules: PaySchedules | null
}) {
  const { supabase, userId, categories, refresh } = useAppData()
  const heading = LIST_HEADING[card.kind]
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // What the last monthly amount saved on this card did.
  const [note, setNote] = useState<string | null>(null)
  const plans = amounts?.status === 'ready' ? amounts.plans : null
  const paid = schedules?.status === 'ready' ? schedules.byCategory : null
  const totals = amounts?.status === 'ready' ? amounts.totals : null
  const total = CARD_TOTAL[card.kind]

  /** Run one write, then reload, or show why it was refused. */
  const write = async (change: () => Promise<unknown>): Promise<boolean> => {
    setMessage(null)
    setNote(null)
    try {
      await change()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.')
      return false
    }
    await refresh()
    return true
  }

  const add = async () => {
    const name = newName.trim()
    if (name === '') return
    if (await write(() => ensureCategory(supabase, userId, atEndOf(categories, name, card.kind)))) setNewName('')
  }

  return (
    <section aria-label={heading} className="rounded-xl bg-card px-4 pb-3 pt-3 shadow-sm">
      {card.header !== undefined ? (
        <h3 className="text-base font-medium text-setup-label">
          <span aria-hidden="true">{card.header[0]} </span>
          {card.header[1]}
        </h3>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
      {message !== null ? (
        <div className="mt-2">
          <Alert tone="error">{message}</Alert>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <>
          {plans !== null ? <PlanHeadings month={month} /> : null}
          {paid !== null ? <PayHeadings /> : null}
          <ul className="mt-2 divide-y">
            {rows.map((row) => (
              <CategoryRow key={row.id} row={row} list={rows} write={write}>
                {plans !== null ? (
                  <PlanFields row={row} plan={plans.get(row.id)} month={month} write={write} onSaved={setNote} nudge={nudges.get(row.id)} />
                ) : null}
                {paid !== null ? <PayFields row={row} stored={paid.get(row.id)} write={write} onSaved={setNote} /> : null}
              </CategoryRow>
            ))}
          </ul>
        </>
      )}
      {note !== null ? <p role="status" className="mt-2 text-xs text-owed-ink">{note}</p> : null}
      {totals !== null && total !== undefined && rows.length > 0 ? (
        <div className="mt-3">
          <TotalTile label={total.label} cents={totals[total.field]} />
        </div>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <Input
          size="sm"
          aria-label={`New ${heading} category`}
          placeholder={`Add to ${heading}`}
          value={newName}
          maxLength={60}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Button type="submit" size="sm" variant="outline" className="h-9" disabled={newName.trim() === ''}>
          <Icon name="plus" /> Add
        </Button>
      </form>
    </section>
  )
}

/** One category: its name, edited where it stands, and anything its list adds on a line below. */
function CategoryRow({
  row,
  list,
  write,
  children,
}: {
  row: Category
  /** The whole list it is on, in the order shown. */
  list: readonly Category[]
  write: (change: () => Promise<unknown>) => Promise<boolean>
  children?: ReactNode
}) {
  const { supabase, categories } = useAppData()
  const [text, setText] = useState(row.name)
  // Follow a rename from elsewhere during render, not in an effect: a mount
  // effect can run after the first keystroke and put the old name back.
  const [shown, setShown] = useState(row.name)
  if (shown !== row.name) {
    setShown(row.name)
    setText(row.name)
  }

  const rename = async () => {
    const name = text.trim()
    // An empty name is never saved; the old one comes back instead.
    if (name === '' || name === row.name) {
      setText(row.name)
      return
    }
    if (!(await write(() => renameCategory(supabase, row.id, name)))) setText(row.name)
  }

  const step = (direction: 'up' | 'down') => {
    const rows = list.map((r) => ({ id: r.id, sortOrder: r.sort_order }))
    const { changes } = moveInList({ rows, id: row.id, direction })
    void write(() => setCategoryOrder(supabase, changes))
  }

  const moveTo = (kind: CategoryKind) => {
    const { sortOrder } = atEndOf(categories, row.name, kind)
    void write(() => moveCategory(supabase, row.id, { kind, sortOrder }))
  }

  return (
    <li className="py-1">
      <div className="flex items-center gap-1">
        <input
          aria-label={`Rename ${row.name}`}
          value={text}
          maxLength={60}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            // Back to the stored name; leaving the field then saves nothing.
            if (e.key === 'Escape') setText(row.name)
          }}
          className="min-w-0 flex-1 rounded-t-md border-b border-input bg-transparent px-1 py-1.5 text-sm outline-none pointer-coarse:min-h-11 focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button variant="ghost" size="icon" aria-label={`Move ${row.name} up`} disabled={list[0]?.id === row.id} onClick={() => step('up')}>
          <Icon name="up" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Move ${row.name} down`} disabled={list.at(-1)?.id === row.id} onClick={() => step('down')}>
          <Icon name="down" />
        </Button>
        {/* A native picker under an icon: on a phone it opens the system wheel.
          The picker is invisible, so its focus is drawn on the icon (FE-3). */}
        <span className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring pointer-coarse:size-11">
          <Icon name="move" className="size-4" />
          <select
            aria-label={`Move ${row.name} to another list`}
            value=""
            onChange={(e) => {
              const kind = LISTS.find((k) => k === e.target.value)
              if (kind !== undefined) moveTo(kind)
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="" disabled>
              Move to…
            </option>
            {LISTS.filter((k) => k !== row.kind).map((k) => (
              <option key={k} value={k}>
                {LIST_HEADING[k]}
              </option>
            ))}
          </select>
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground"
          aria-label={`Remove ${row.name}`}
          onClick={() => void write(() => removeCategory(supabase, row.id))}
        >
          <Icon name="trash" />
        </Button>
      </div>
      {children}
    </li>
  )
}
