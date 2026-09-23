import { useState, type ReactNode } from 'react'
import { useAppData } from '../app-data.js'
import { appendToLists, isoDate, monthBounds, moveInList } from '@budget/core'
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
import { todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'
import { useMonthlyAmounts, type MonthlyAmounts } from './SetupPlans.js'

interface ListCard {
  readonly kind: CategoryKind
  /** The column heading Workbook puts on the card, emoji and all (START HERE row 7 and 17). */
  readonly header?: readonly [emoji: string, text: string]
  /** Short help, from the note Workbook attaches to the card's heading cell. */
  readonly hint: string
}

/**
 * START HERE's layout: section labels, and under each one its cards, in the
 * order Workbook has them. "Not spending" is the app's own and comes last.
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
        // Workbook's note (D17) invites every open credit line; the second
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
 * Setup: Workbook's START HERE tab. Your name, and every category under the
 * list it belongs to, which decides where its charges are counted.
 */
export function SetupScreen() {
  const { categories, version } = useAppData()
  const lists = new Map(groupByList(categories).map((group) => [group.kind, group.rows]))
  // How many the starter button added, kept here so its message stays once
  // the button itself is gone.
  const [added, setAdded] = useState<number | null>(null)
  // Monthly amounts are set from this month on (D13), as Workbook's Bills tab
  // sets one for every month.
  const month = monthBounds(isoDate(todayIso())).start
  const amounts = useMonthlyAmounts(month)

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
            {section.cards.map((card) => (
              <ListCardView key={card.kind} card={card} rows={lists.get(card.kind) ?? []} />
            ))}
          </section>
        ))}
      </div>
    </div>
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
 * Below this many categories, Setup offers Workbook's names. Workbook's list is 31
 * names, so once it has been added the offer is gone; someone who has
 * already built lists of their own is not asked.
 */
const FEW_CATEGORIES = 20

/** "Start from Workbook's list": every list filled with names to rename (plan §7). */
function StarterCard({ onAdded }: { onAdded: (count: number) => void }) {
  const { supabase, userId, categories, goal, refresh } = useAppData()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const start = async () => {
    setBusy(true)
    setMessage(null)
    const { rows } = appendToLists({
      existing: categories.map((c) => ({ name: c.name, kind: c.kind, sortOrder: c.sort_order })),
      wanted: starterList(goal === null ? null : goal.name),
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
    <section aria-label="Start from Workbook's list" className="rounded-xl bg-card px-4 py-4 shadow-sm">
      <p className="text-sm">
        Fill your lists with Workbook&apos;s example names — Rent, Groceries, Netflix and the rest — plus Card payments and
        Card interest &amp; fees for your statement. Names you already have stay as they are.
      </p>
      {message !== null ? (
        <div className="mt-2">
          <Alert tone="error">{message}</Alert>
        </div>
      ) : null}
      <Button className="mt-3" disabled={busy} onClick={() => void start()}>
        Start from Workbook&apos;s list
      </Button>
    </section>
  )
}

/** What the starter button did, and that the names are only placeholders. */
function StarterAdded({ count }: { count: number }) {
  if (count === 0) {
    return <Alert tone="success">Everything on Workbook&apos;s list is already here, so nothing was added.</Alert>
  }
  return (
    <Alert tone="success" title={`Added ${count} of Workbook's example ${count === 1 ? 'name' : 'names'}`}>
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
        className="-ml-1 mb-2 rounded px-1 text-sm text-setup-band-ink/90 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        ‹ More
      </button>
      <h1 className="font-serif text-4xl italic">Start here!</h1>
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
          className="min-w-0 flex-1 border-b border-white/80 bg-transparent pb-1 italic text-setup-band-ink outline-none placeholder:text-setup-band-ink/60 focus-visible:border-white"
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

function ListCardView({ card, rows }: { card: ListCard; rows: readonly Category[] }) {
  const { supabase, userId, categories, refresh } = useAppData()
  const heading = LIST_HEADING[card.kind]
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  /** Run one write, then reload, or show why it was refused. */
  const write = async (change: () => Promise<unknown>): Promise<boolean> => {
    setMessage(null)
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
        <ul className="mt-2 divide-y">
          {rows.map((row) => (
            <CategoryRow key={row.id} row={row} list={rows} write={write} />
          ))}
        </ul>
      )}
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
          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button variant="ghost" size="icon" className="size-9" aria-label={`Move ${row.name} up`} disabled={list[0]?.id === row.id} onClick={() => step('up')}>
          <Icon name="up" />
        </Button>
        <Button variant="ghost" size="icon" className="size-9" aria-label={`Move ${row.name} down`} disabled={list.at(-1)?.id === row.id} onClick={() => step('down')}>
          <Icon name="down" />
        </Button>
        {/* A native picker under an icon: on a phone it opens the system wheel. */}
        <span className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
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
          className="size-9 text-muted-foreground"
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
