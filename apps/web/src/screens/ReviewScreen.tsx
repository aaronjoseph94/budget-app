import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppData } from '../app-data.js'
import {
  approveCandidate,
  dismissUnreadableLine,
  ensureCategory,
  listPending,
  listRules,
  listUnreadable,
  rejectCandidate,
  type Category,
  type IngestSource,
  type PendingCandidate,
  type UnreadablePage,
} from '../ledger.js'
import { describeReason, formatCents, formatIsoDate, localDateOf } from '../format.js'
import { IngestedText } from '../ui.js'
import { atEndOf, CategoryOptions, ListSelect, type CategoryKind } from '../lists.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge, Empty } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'
import { navigate } from '../nav.js'

const NEW_CATEGORY = '__new__'

/**
 * Cards drawn at a time. Each carries a picker of every category, and all
 * 240 of a first import's queue took over a second to draw on a phone, and
 * again after every approval (PERF-1). The oldest come first, as before.
 */
const PAGE = 25

/** A category being made while filing a row: its name and the list it goes on. */
interface NewName {
  readonly name: string
  readonly kind: CategoryKind
}

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
  const [unreadable, setUnreadable] = useState<UnreadablePage | null>(null)
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
  const [drawn, setDrawn] = useState(PAGE)
  // Which read is the latest. A read started before a dismissal can answer
  // after the one started after it, and would put the dismissed line back.
  const reads = useRef(0)
  // What the last action did. The card acted on is gone, or its button was
  // disabled while it ran, so focus had fallen to the page; it goes here
  // instead, which also reads out what happened (FE-6).
  const said = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const read = ++reads.current
    // Settled apart, so a failure reading the unreadable lines never hides the
    // charges waiting in the queue (and a queue failure never hides the lines).
    const [queue, lines] = await Promise.allSettled([
      Promise.all([listPending(supabase), listRules(supabase)]),
      listUnreadable(supabase),
    ])
    if (read !== reads.current) return
    if (queue.status === 'fulfilled') {
      const [page, r] = queue.value
      setRows(page.rows)
      setTotal(page.total)
      setRules(r)
    }
    if (lines.status === 'fulfilled') setUnreadable(lines.value)
    const failed = queue.status === 'rejected' ? queue.reason : lines.status === 'rejected' ? lines.reason : null
    setLoadError(
      failed === null ? null : failed instanceof Error ? failed.message : 'Could not load the review queue.',
    )
  }, [supabase])

  useEffect(() => {
    void load()
  }, [load, version])

  const categoryFor = (row: PendingCandidate) => picked[row.id] ?? rules.get(row.merchant) ?? ''

  const act = async (row: PendingCandidate, action: 'approve' | 'reject', created?: NewName) => {
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
        if (created !== undefined) {
          categoryId = (await ensureCategory(supabase, userId, atEndOf(categories, created.name, created.kind))).id
        }
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
    said.current?.focus()
  }

  // The cards are memoised, so they take callbacks that never change and
  // reach the latest act through a ref: one card busy or picked redraws
  // that card, not every card in the queue.
  const latest = useRef(act)
  useLayoutEffect(() => {
    latest.current = act
  })
  const onPick = useCallback((rowId: string, id: string) => setPicked((p) => ({ ...p, [rowId]: id })), [])
  const onApprove = useCallback((row: PendingCandidate, created?: NewName) => void latest.current(row, 'approve', created), [])
  const onReject = useCallback((row: PendingCandidate) => void latest.current(row, 'reject'), [])

  // Every Dismiss waits until the list has been read again, so the line
  // tapped is off the screen before another can be tapped in its place.
  const dismiss = async (lineId: string) => {
    setBusy(lineId)
    setNote(null)
    setError(null)
    try {
      await dismissUnreadableLine(supabase, lineId)
      setNote('Dismissed. That line will not show here again.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.')
      setBusy(null)
      return
    }
    // As in act: it has already succeeded, and load() reports its own errors.
    await load()
    setBusy(null)
    said.current?.focus()
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

      <div ref={said} tabIndex={-1} className="space-y-4 outline-none empty:hidden">
        {note !== null ? <Alert tone="success">{note}</Alert> : null}
        {/* Errors sit above the list and do NOT replace it: a single failure used
            to swap the whole queue for an error card until the page was reloaded. */}
        {(error ?? loadError) !== null ? <Alert tone="error" title="That did not work">{error ?? loadError}</Alert> : null}
      </div>

      {rows !== null && rows.length === 0 && unreadable?.total === 0 ? (
        <Card>
          <Empty icon={<Icon name="check" />} title="All caught up">
            Import a statement and anything it finds that you have not categorised before will wait here.
          </Empty>
          {/* Not a dead end: what was just approved is counted on the Month. */}
          <div className="-mt-6 flex justify-center pb-8">
            <Button variant="outline" onClick={() => navigate('month')}>
              See this month
            </Button>
          </div>
        </Card>
      ) : null}

      <ul className="space-y-3">
        {(rows ?? []).slice(0, drawn).map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            categoryId={categoryFor(row)}
            suggested={picked[row.id] === undefined && rules.has(row.merchant)}
            categories={categories}
            busy={busy === row.id}
            onPick={onPick}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </ul>

      {rows !== null && rows.length > drawn ? (
        <Button variant="outline" className="w-full" onClick={() => setDrawn((n) => n + PAGE)}>
          {rows.length - drawn > PAGE ? `Show the next ${PAGE}` : `Show the last ${rows.length - drawn}`}
        </Button>
      ) : null}
      {rows !== null && total > Math.min(drawn, rows.length) ? (
        <p className="text-center text-xs text-muted-foreground">
          Showing the oldest {Math.min(drawn, rows.length)} of {total}.
          {rows.length < total ? ' Approve some and the rest will load.' : ''}
        </p>
      ) : null}

      {unreadable !== null && unreadable.total > 0 ? (
        <UnreadableLines page={unreadable} busy={busy} onDismiss={(id) => void dismiss(id)} />
      ) : null}
    </div>
  )
}

const ReviewRow = memo(function ReviewRow({
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
  categories: readonly Category[]
  busy: boolean
  onPick: (rowId: string, id: string) => void
  onApprove: (row: PendingCandidate, created?: NewName) => void
  onReject: (row: PendingCandidate) => void
}) {
  const [newName, setNewName] = useState('')
  // A charge most likely belongs in Variable expenses. Money in could be a
  // refund, a card payment or pay, so nothing is assumed for it.
  const [newKind, setNewKind] = useState<CategoryKind | ''>(row.amount_cents < 0 ? 'variable' : '')
  const creating = categoryId === NEW_CATEGORY
  const ready = creating ? newName.trim().length > 0 && newKind !== '' : categoryId !== ''

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
              onChange={(e) => onPick(row.id, e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a category…</option>
              <CategoryOptions categories={categories} />
              <option value={NEW_CATEGORY}>+ New category…</option>
            </NativeSelect>
          </div>
          {creating ? (
            <>
              <Input
                autoFocus
                placeholder="Category name, e.g. Groceries"
                value={newName}
                maxLength={60}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1"
              />
              <div className="sm:w-44">
                <ListSelect value={newKind} onChange={setNewKind} disabled={busy} />
              </div>
            </>
          ) : null}
          <div className="flex gap-2">
            <Button
              className="flex-1 sm:flex-none"
              disabled={!ready || busy}
              onClick={() => onApprove(row, creating && newKind !== '' ? { name: newName.trim(), kind: newKind } : undefined)}
            >
              <Icon name="check" /> Approve
            </Button>
            <Button variant="outline" size="icon" aria-label="Not a real transaction — remove" disabled={busy} onClick={() => onReject(row)}>
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
})

const SOURCE: Record<IngestSource, string> = {
  card_csv: 'Card statement (CSV)',
  card_xlsx: 'Card statement (spreadsheet)',
  card_pdf: 'Card statement (PDF)',
  receipt_photo: 'Receipt photo',
  typed: 'Typed entry',
}

/**
 * Lines an import could not read, each with its reason.
 *
 * CLAUDE.md requires every ingestion failure to reach this screen. These were
 * saved by every import and shown nowhere. Only the line's position and a
 * reason code are stored, never its text, so what is shown is a number and a
 * sentence from describeReason — nothing here came from the file itself.
 *
 * Each stays until the owner dismisses it (0012), however old it is.
 */
function UnreadableLines({
  page,
  busy,
  onDismiss,
}: {
  page: UnreadablePage
  busy: string | null
  onDismiss: (lineId: string) => void
}) {
  return (
    <section aria-labelledby="unreadable-title">
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Icon name="alert" className="size-4 text-warning" />
          <h2 id="unreadable-title" className="font-medium">
            {page.total === 1 ? '1 line could not be read' : `${page.total} lines could not be read`}
          </h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          These were left out of your budget. Find each one on the statement, and if it is a real charge, add it
          yourself with Add, then Type it. Dismiss a line once you have dealt with it. A PDF statement's rows are
          counted from its first transaction.
        </p>
        {page.batches.map((batch) => (
          <div key={batch.id} className="mt-4">
            <p className="text-xs font-medium text-muted-foreground">
              {SOURCE[batch.source]} · imported {formatIsoDate(localDateOf(batch.created_at))}
            </p>
            <ul className="mt-2 space-y-2">
              {page.lines
                .filter((line) => line.batch_id === batch.id)
                .map((line) => {
                  const where = `${batch.source === 'card_pdf' ? 'Row' : 'Line'} ${line.source_line}`
                  return (
                    <li key={line.id} className={cn('flex items-start gap-3 text-sm', busy === line.id && 'opacity-60')}>
                      <span className="tnum w-16 shrink-0 text-muted-foreground">{where}</span>
                      <span className="flex-1">{describeReason(line.reason)}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="-my-1"
                        aria-label={`Dismiss ${where.toLowerCase()}`}
                        disabled={busy !== null}
                        onClick={() => onDismiss(line.id)}
                      >
                        Dismiss
                      </Button>
                    </li>
                  )
                })}
            </ul>
          </div>
        ))}
        {page.total > page.lines.length ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Showing {page.lines.length} of {page.total}.
          </p>
        ) : null}
      </Card>
    </section>
  )
}
