import { useCallback, useEffect, useState } from 'react'
import {
  approveCandidate,
  ensureCategory,
  listCategories,
  listPending,
  listTransactions,
  type LedgerRow,
  type NamedRow,
  type PendingCandidate,
} from './ledger.js'
import type { SupabaseClient } from './supabase.js'
import { Button, Card, IngestedText, Label } from './ui.js'
import { formatCents, formatIsoDate } from './format.js'

/** Somewhere to put a transaction before real categories exist. */
const FALLBACK_CATEGORY = 'Uncategorised'

export function ReviewQueue({
  supabase,
  userId,
  refreshKey,
}: {
  supabase: SupabaseClient
  userId: string
  refreshKey: number
}) {
  const [pending, setPending] = useState<readonly PendingCandidate[] | null>(null)
  const [ledger, setLedger] = useState<readonly LedgerRow[]>([])
  const [categories, setCategories] = useState<readonly NamedRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [queue, book, cats] = await Promise.all([
        listPending(supabase),
        listTransactions(supabase),
        listCategories(supabase),
      ])
      setPending(queue)
      setLedger(book)
      setCategories(cats)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not load')
    }
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const approve = async (candidate: PendingCandidate) => {
    setBusy(candidate.id)
    setNote(null)
    try {
      const category =
        categories[0] ?? (await ensureCategory(supabase, userId, FALLBACK_CATEGORY))
      const outcome = await approveCandidate(supabase, candidate.id, category.id)
      setNote(
        outcome === 'approved'
          ? 'Added to your ledger.'
          : outcome === 'already_in_ledger'
            ? 'You already had that one, so nothing was added.'
            : 'That one had already been handled.',
      )
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'could not approve')
    } finally {
      setBusy(null)
    }
  }

  if (error !== null) {
    return (
      <Card className="border-spend/40 p-4">
        <Label>Something went wrong</Label>
        <p className="mt-2 text-sm">{error}</p>
      </Card>
    )
  }

  if (pending === null) {
    return <p className="py-8 text-center text-sm text-ink-soft">Loading…</p>
  }

  return (
    <div className="space-y-6">
      {note !== null ? <p className="text-sm text-income">{note}</p> : null}

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <Label>
            {pending.length === 0
              ? 'Nothing waiting for you'
              : `${pending.length} waiting for you`}
          </Label>
        </div>
        {pending.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Import a statement and anything it finds will wait here until you approve it.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {pending.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                <span className="tnum w-28 shrink-0 text-sm text-ink-soft">
                  {formatIsoDate(row.posted_on)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <IngestedText>{row.merchant_raw}</IngestedText>
                </span>
                <span
                  className={`tnum shrink-0 text-sm font-medium ${
                    row.amount_cents < 0 ? 'text-spend' : 'text-income'
                  }`}
                >
                  {formatCents(row.amount_cents)}
                </span>
                <Button disabled={busy === row.id} onClick={() => void approve(row)}>
                  {busy === row.id ? '…' : 'Approve'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <Label>
            {ledger.length === 0 ? 'Your ledger is empty' : `${ledger.length} in your ledger`}
          </Label>
        </div>
        {ledger.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-soft">
            Approved transactions appear here. Importing the same statement twice adds nothing
            the second time.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {ledger.map((row) => (
              <li key={row.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className="tnum w-28 shrink-0 text-sm text-ink-soft">
                  {formatIsoDate(row.posted_on)}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <IngestedText>{row.merchant_raw}</IngestedText>
                </span>
                <span
                  className={`tnum shrink-0 text-sm font-medium ${
                    row.amount_cents < 0 ? 'text-spend' : 'text-income'
                  }`}
                >
                  {formatCents(row.amount_cents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
