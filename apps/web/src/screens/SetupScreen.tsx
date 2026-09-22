import { useState } from 'react'
import { useAppData } from '../app-data.js'
import type { Category } from '../ledger.js'
import { groupByList, LIST_HEADING, type CategoryKind } from '../lists.js'
import { saveDisplayName } from '../profile.js'
import { Alert } from '../components/ui/feedback.js'
import { Icon } from '../components/ui/icons.js'
import { navigate } from '../nav.js'

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
      { kind: 'debt', header: ['💳', 'Debts'], hint: 'What debt do you have? Loans and credit lines you plan to pay off.' },
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
  const { categories } = useAppData()
  const lists = new Map(groupByList(categories).map((group) => [group.kind, group.rows]))

  return (
    <div className="-mx-4 -mt-6 bg-setup-canvas pb-6 md:mx-0 md:mt-0 md:overflow-hidden md:rounded-xl">
      <NameBand />
      <div className="space-y-6 px-4 pt-5">
        {SECTIONS.map((section) => (
          <section key={section.label} className="space-y-2">
            <h2 className="text-xl font-medium text-setup-label">{section.label}</h2>
            {section.cards.map((card) => (
              <ListCardView key={card.kind} card={card} rows={lists.get(card.kind) ?? []} />
            ))}
          </section>
        ))}
      </div>
    </div>
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
    <header className="safe-top bg-setup-band px-4 pb-5 pt-3 text-white">
      <button
        type="button"
        onClick={() => navigate('settings')}
        className="-ml-1 mb-2 rounded px-1 text-sm text-setup-band-ink/90 outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        ‹ Settings
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
  return (
    <section aria-label={LIST_HEADING[card.kind]} className="rounded-xl bg-card px-4 pb-3 pt-3 shadow-sm">
      {card.header !== undefined ? (
        <h3 className="text-base font-medium text-setup-label">
          <span aria-hidden="true">{card.header[0]} </span>
          {card.header[1]}
        </h3>
      ) : null}
      <p className="mt-0.5 text-xs text-muted-foreground">{card.hint}</p>
      {rows.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="mt-2 divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-2 text-sm">
              {row.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
