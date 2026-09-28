import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { isoDate, monthBounds, shiftMonth, summariseImport } from '@budget/core'
import { useAppData } from '../app-data.js'
import { deleteTransaction, listTransactions, type LedgerRow } from '../ledger.js'
import { formatCents, formatIsoDate, formatMonthTitle, todayIso } from '../format.js'
import { IngestedText } from '../ui.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge, Empty } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { HelpButton } from '../help/HelpButton.js'

/** All transactions: everything that reached the ledger, a month at a time. */
export function LedgerScreen() {
  const { supabase, categories, refresh, version } = useAppData()
  const [month, setMonth] = useState(() => shiftMonth(isoDate(todayIso()), 0))
  const [rows, setRows] = useState<readonly LedgerRow[] | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const bounds = useMemo(() => monthBounds(month), [month])

  useEffect(() => {
    let live = true
    setRows(null)
    listTransactions(supabase, { from: bounds.start, to: bounds.end })
      .then((r) => live && (setRows(r), setError(null)))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load the ledger.'))
    return () => {
      live = false
    }
  }, [supabase, bounds.start, bounds.end, version])

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

  const remove = async (id: string) => {
    setConfirming(null)
    try {
      await deleteTransaction(supabase, id)
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not remove it.')
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          {/* More's name for it: one screen, one name. */}
          <div className="flex flex-wrap items-center gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">All transactions</h1>
            <HelpButton screen="ledger" />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatMonthTitle(month)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>

      {totals !== null ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Money out</p>
            <p className="text-xl font-bold">
              <Figure>{formatCents(totals.outflowCents)}</Figure>
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">Money in</p>
            <p className="text-xl font-bold text-income">
              <Figure>{formatCents(totals.inflowCents)}</Figure>
            </p>
          </Card>
          {/* A plain sum of the rows, so a card payment is money in here and
            never on the Month; said, so neither reads as the Month's Spent. */}
          <p className="col-span-2 text-xs text-muted-foreground">
            Every row as it is, card payments and savings moves included. The Month counts spending by list.
          </p>
        </div>
      ) : null}

      <Input placeholder="Search merchant or category" value={query} onChange={(e) => setQuery(e.target.value)} />

      {error !== null ? <Alert tone="error" title="Something went wrong">{error}</Alert> : null}

      {rows === null && error === null ? <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p> : null}

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
          <h2 className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{formatIsoDate(day)}</h2>
          <Card className="overflow-hidden">
            <ul className="divide-y">
              {items.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      <IngestedText>{r.merchant_raw}</IngestedText>
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge variant="secondary">{names.get(r.category_id) ?? 'Unknown'}</Badge>
                      {r.source === 'typed' ? <span className="text-xs text-muted-foreground">added by hand</span> : null}
                    </div>
                  </div>
                  <span className={cn('tnum shrink-0 text-sm font-semibold', r.amount_cents > 0 && 'text-income')}>
                    {formatCents(r.amount_cents)}
                  </span>
                  {confirming === r.id ? (
                    <Button variant="destructive" size="sm" onClick={() => void remove(r.id)}>
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
