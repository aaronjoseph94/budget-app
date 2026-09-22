import { useCallback, useEffect, useState } from 'react'
import { useAppData } from '../app-data.js'
import {
  approveCandidate,
  ensureCategory,
  listPending,
  listRules,
  rejectCandidate,
  type PendingCandidate,
} from '../ledger.js'
import { formatCents, formatIsoDate } from '../format.js'
import { IngestedText } from '../ui.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge, Empty } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'

const NEW_CATEGORY = '__new__'

/**
 * The review queue: the one place a human decides what a charge was.
 *
 * Every row needs a category chosen before it can be approved. The previous
 * screen had no picker at all and filed everything under whichever category
 * sorted first, so the decision the whole approval design protects was never
 * actually made. When the user has categorised this merchant before, the
 * earlier choice is pre-selected — a suggestion they still confirm, never an
 * approval made for them. Only an exact rule match at import time approves
 * without a tap, and those never reach this screen.
 */
export function ReviewScreen() {
  const { supabase, userId, categories, refresh, version } = useAppData()
  const [rows, setRows] = useState<readonly PendingCandidate[] | null>(null)
  const [total, setTotal] = useState(0)
  const [rules, setRules] = useState<ReadonlyMap<string, string>>(new Map())
  const [picked, setPicked] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Kept apart from `error`: the provider's first refresh reloads this screen,
  // and a reload that succeeded used to clear the message of an approval that
  // had just failed.
  const [loadError, setLoadError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [page, r] = await Promise.all([listPending(supabase), listRules(supabase)])
      setRows(page.rows)
      setTotal(page.total)
      setRules(r)
      setLoadError(null)
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : 'Could not load the review queue.')
    }
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load, version])

  const categoryFor = (row: PendingCandidate) => picked[row.id] ?? rules.get(row.merchant) ?? ''

  const act = async (row: PendingCandidate, action: 'approve' | 'reject', newName?: string) => {
    setBusy(row.id)
    setNote(null)
    setError(null)
    let done = false
    try {
      if (action === 'reject') {
        await rejectCandidate(supabase, row.id)
        setNote('Removed from the queue. It will not be counted.')
      } else {
        let categoryId = categoryFor(row)
        if (newName !== undefined) categoryId = (await ensureCategory(supabase, userId, newName)).id
        if (categoryId === '' || categoryId === NEW_CATEGORY) return
        const outcome = await approveCandidate(supabase, row.id, categoryId)
        setNote(
          outcome === 'approved'
            ? 'Added. Future charges from this merchant will be filed the same way automatically.'
            : outcome === 'already_in_ledger'
              ? 'You already had that one, so nothing was added.'
              : 'That one had already been handled.',
        )
      }
      done = true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.')
    } finally {
      setBusy(null)
    }
    // Outside the try: the action has already succeeded, and a refresh that
    // fails afterwards must not be reported as the action failing. load() and
    // refresh() each report their own errors.
    if (done) await Promise.all([load(), refresh()])
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">
          {rows === null ? 'Loading…' : total === 0 ? 'Nothing waiting.' : `${total} waiting for a category.`} Nothing reaches your
          budget until you approve it.
        </p>
      </header>

      {note !== null ? <Alert tone="success">{note}</Alert> : null}
      {/* Errors sit above the list and do NOT replace it: a single failure used
          to swap the whole queue for an error card until the page was reloaded. */}
      {(error ?? loadError) !== null ? <Alert tone="error" title="That did not work">{error ?? loadError}</Alert> : null}

      {rows !== null && rows.length === 0 ? (
        <Card>
          <Empty icon={<Icon name="check" />} title="All caught up">
            Import a statement and anything it finds that you have not categorised before will wait here.
          </Empty>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {(rows ?? []).map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            categoryId={categoryFor(row)}
            suggested={picked[row.id] === undefined && rules.has(row.merchant)}
            categories={categories}
            busy={busy === row.id}
            onPick={(id) => setPicked((p) => ({ ...p, [row.id]: id }))}
            onApprove={(newName) => void act(row, 'approve', newName)}
            onReject={() => void act(row, 'reject')}
          />
        ))}
      </ul>

      {rows !== null && total > rows.length ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the oldest {rows.length} of {total}. Approve some and the rest will load.
        </p>
      ) : null}
    </div>
  )
}

function ReviewRow({
  row,
  categoryId,
  suggested,
  categories,
  busy,
  onPick,
  onApprove,
  onReject,
}: {
  row: PendingCandidate
  categoryId: string
  suggested: boolean
  categories: readonly { id: string; name: string }[]
  busy: boolean
  onPick: (id: string) => void
  onApprove: (newName?: string) => void
  onReject: () => void
}) {
  const [newName, setNewName] = useState('')
  const creating = categoryId === NEW_CATEGORY
  const ready = creating ? newName.trim().length > 0 : categoryId !== ''

  return (
    <li>
      <Card className={cn('p-4 transition-opacity', busy && 'opacity-60')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium leading-snug">
              <IngestedText>{row.merchant_raw}</IngestedText>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{formatIsoDate(row.posted_on)}</p>
          </div>
          <span className={cn('tnum shrink-0 font-semibold', row.amount_cents < 0 ? 'text-foreground' : 'text-income')}>
            {formatCents(row.amount_cents)}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex-1">
            <NativeSelect
              aria-label="Category"
              value={categoryId}
              onChange={(e) => onPick(e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>+ New category…</option>
            </NativeSelect>
          </div>
          {creating ? (
            <Input
              autoFocus
              placeholder="Category name, e.g. Groceries"
              value={newName}
              maxLength={60}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1"
            />
          ) : null}
          <div className="flex gap-2">
            <Button
              className="flex-1 sm:flex-none"
              disabled={!ready || busy}
              onClick={() => onApprove(creating ? newName.trim() : undefined)}
            >
              <Icon name="check" /> Approve
            </Button>
            <Button variant="outline" size="icon" aria-label="Not a real transaction — remove" disabled={busy} onClick={onReject}>
              <Icon name="x" />
            </Button>
          </div>
        </div>
        {suggested ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Badge variant="outline">
              <Icon name="sparkles" className="size-3" /> Suggested
            </Badge>
            How you filed this merchant last time.
          </p>
        ) : null}
      </Card>
    </li>
  )
}
