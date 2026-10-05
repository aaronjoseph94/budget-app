import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { isoDate, monthBounds, shiftMonth, summariseImport } from '@budget/core'
import { useAppData } from '../app-data.js'
import { deleteTransaction, listTransactions, type LedgerRow } from '../ledger.js'
import { formatCents, formatIsoDate, formatMonthTitle, formatShortMonth, todayIso } from '../format.js'
import { IngestedText } from '../ui.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge, Empty, Loading } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { StepButton } from './MonthScreen.js'
import { cn } from '../lib/cn.js'
import { useRead } from '../lib/use-read.js'
import { HelpButton } from '../help/HelpButton.js'

/** All transactions: everything that reached the ledger, a month at a time. */
export function LedgerScreen() {
  const { supabase, categories, refresh } = useAppData()
  const [month, setMonth] = useState(() => shiftMonth(isoDate(todayIso()), 0))
  const [query, setQuery] = useState('')
  const [removeError, setRemoveError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  // Removed here: off the list at once, before the month is read again.
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set())
  const bounds = useMemo(() => monthBounds(month), [month])

  // The month's rows by the shared read protocol (lib/use-read.ts): a read
  // again after a removal keeps the rows on screen, and the scroll with
  // them, until it lands; only a new month shows "Loading…" (bc1fced).
  const read = useRead(month, () => listTransactions(supabase, { from: bounds.start, to: bounds.end }))
  const rows = useMemo(() => (read.status === 'ready' ? read.value.filter((r) => !removed.has(r.id)) : null), [read, removed])
  const readError = read.status === 'failed' ? (read.error instanceof Error ? read.error.message : 'Could not load the ledger.') : null
  const error = removeError ?? readError

  const names = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  // The field shows each key at once; the month's rows are filtered and
  // redrawn a moment behind it, so typing never waits for 300 rows (PERF-5).
  const searched = useDeferredValue(query)
  const visible = useMemo(() => {
    const q = searched.trim().toLowerCase()
    if (rows === null || q === '') return rows
    return rows.filter((r) => r.merchant_raw.toLowerCase().includes(q) || (names.get(r.category_id) ?? '').toLowerCase().includes(q))
  }, [rows, searched, names])
  const totals = useMemo(
    () => (visible === null ? null : summariseImport({ amountsCents: visible.map((r) => r.amount_cents) })),
    [visible],
  )
  const byDay = useMemo(() => {
    const groups = new Map<string, LedgerRow[]>()
    for (const r of visible ?? []) groups.set(r.posted_on, [...(groups.get(r.posted_on) ?? []), r])
    return [...groups.entries()]
  }, [visible])

  const isCurrent = shiftMonth(isoDate(todayIso()), 0) === month

  // Remove gives way to nothing, and focus fell to the page: once the row
  // is off the list, the next row's trash button takes it, or the one
  // before, or the search (e2e-money-03).
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const after = useRef<string | null>(null)
  useEffect(() => {
    const id = after.current
    const now = document.activeElement
    if (id === null || (now !== null && now !== document.body)) return
    after.current = null
    const next = id === '' ? null : list.current?.querySelector<HTMLButtonElement>(`[data-row="${id}"] button`)
    ;(next ?? search.current)?.focus()
  }, [visible])

  const remove = async (id: string) => {
    const shown = visible ?? []
    const at = shown.findIndex((r) => r.id === id)
    after.current = (shown[at + 1] ?? shown[at - 1])?.id ?? ''
    setConfirming(null)
    setRemoveError(null)
    try {
      await deleteTransaction(supabase, id)
      // Off the list as soon as it is deleted: the rows stay while the month
      // is read again (3d86680), and a deleted row kept with them still offered
      // Remove, and its amount, until the read landed.
      setRemoved((s) => new Set([...s, id]))
      await refresh()
    } catch (cause) {
      setRemoveError(cause instanceof Error ? cause.message : 'Could not remove it.')
    }
  }

  return (
    // Mockup A: the Month's title row and its ‹ Sep 2026 › stepper, the two
    // totals as flat stat cards, and each day's rows in a flat card.
    <div ref={list} className="space-y-4 md:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          {/* More's name for it: one screen, one name. */}
          <div className="flex flex-wrap items-center gap-1">
            <MonthTitle>All transactions</MonthTitle>
            <HelpButton screen="ledger" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {formatMonthTitle(month)}
          </p>
        </div>
        <div className="flex items-stretch rounded-md border bg-card">
          <StepButton label="Previous month" icon="chevronLeft" onClick={() => setMonth(shiftMonth(month, -1))} />
          <span className="tnum flex items-center border-x px-3.5 text-[0.9375rem] font-medium whitespace-nowrap">{formatShortMonth(month)}</span>
          <StepButton label="Next month" icon="chevronRight" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))} />
        </div>
      </header>

      {totals !== null ? (
        // White, not the mockup's rose and green: those hues name the Debts
        // and Income lists (ADR 0010), and these totals are every row.
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          <Card className="min-w-0 p-4 md:px-6 md:py-5">
            <p className="text-sm text-muted-foreground md:text-[0.9375rem]">Money out</p>
            <p className="mt-1 text-xl font-bold tracking-[-0.02em] md:text-2xl xl:text-[2rem]">
              <Figure>{formatCents(totals.outflowCents)}</Figure>
            </p>
          </Card>
          <Card className="min-w-0 p-4 md:px-6 md:py-5">
            <p className="text-sm text-muted-foreground md:text-[0.9375rem]">Money in</p>
            <p className="mt-1 text-xl font-bold tracking-[-0.02em] text-income md:text-2xl xl:text-[2rem]">
              <Figure>{formatCents(totals.inflowCents)}</Figure>
            </p>
          </Card>
          {/* A plain sum of the rows, so a card payment is money in here and
            never on the Month; said, so neither reads as the Month's Spent. */}
          <p className="col-span-2 text-xs text-muted-foreground md:text-[0.8125rem]">
            Every row as it is, card payments and savings moves included. The Month counts spending by list.
          </p>
        </div>
      ) : null}

      <Input
        ref={search}
        type="search"
        aria-label="Search this month's transactions"
        placeholder="Search merchant or category"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error !== null ? <Alert tone="error" title="Something went wrong">{error}</Alert> : null}

      {rows === null && error === null ? <Loading what="this month’s transactions" /> : null}

      {visible !== null && visible.length === 0 ? (
        <Card>
          <Empty icon={<Icon name="list" />} title={query === '' ? 'Nothing this month' : 'No matches'}>
            {query === '' ? 'Approved transactions appear here.' : 'Try a different word.'}
          </Empty>
        </Card>
      ) : null}

      {byDay.map(([day, items]) => (
        // Days off screen skip layout and paint until scrolled to (PERF-5).
        <section key={day} className="[contain-intrinsic-size:auto_12rem] [content-visibility:auto]">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{formatIsoDate(day)}</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r.id} data-row={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-5 md:py-3.5">
                  <div className="min-w-0 flex-1">
                    {/* As the statement printed it, in the mockup's fixed-width face. */}
                    <p className="truncate font-mono text-sm">
                      <IngestedText>{r.merchant_raw}</IngestedText>
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant="secondary">{names.get(r.category_id) ?? 'Unknown'}</Badge>
                      {r.source === 'typed' || r.source === 'ai_app' ? (
                        <span className="text-xs text-muted-foreground">{r.source === 'typed' ? 'added by hand' : 'added by an AI app'}</span>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn('tnum shrink-0 text-sm font-bold md:text-base', r.amount_cents > 0 && 'text-income')}>
                    {formatCents(r.amount_cents)}
                  </span>
                  {confirming === r.id ? (
                    // Takes focus from the trash button it replaces, which went (e2e-money-03).
                    <Button variant="destructive" size="sm" autoFocus onClick={() => void remove(r.id)}>
                      Remove
                    </Button>
                  ) : (
                    <Button variant="ghost" size="icon" aria-label="Remove this transaction" onClick={() => setConfirming(r.id)}>
                      <Icon name="trash" className="size-4 text-muted-foreground" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  )
}
