import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { similarMerchant } from '@budget/statement-parsers'
import { useAppData } from '../app-data.js'
import {
  approveCandidate,
  clearCandidateSuggestion,
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
import { afterSomeSaved, describeReason, formatCents, formatIsoDate, localDateOf } from '../format.js'
import { IngestedText } from '../ui.js'
import { atEndOf, CategoryOptions, ListSelect, NEW_CATEGORY, type CategoryKind } from '../lists.js'
import { Card } from '../components/ui/card.js'
import { Alert, Badge, Empty } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Input, NativeSelect } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { cn } from '../lib/cn.js'
import { useFocusDrawn } from '../lib/return-focus.js'
import { navigate } from '../nav.js'
import { HelpButton } from '../help/HelpButton.js'
import { ApproveAll, ApproveAllButton } from '../review/ApproveAll.js'
import { SuggestButton, SuggestLine, suggestOffered } from '../review/SuggestBar.js'
import { MonthTitle } from '../components/ui/type.js'
import { useSuggestions } from '../review/use-suggestions.js'
import { addedBy } from '../ai-apps/access.js'
import { SuggestedChanges } from '../review/SuggestedChanges.js'

/** `busy` while Approve these N works through its rows: every row waits. */
const ALL = '__all__'

/**
 * Cards drawn at a time. Each carries a picker of every category, and all
 * 240 of a first import's queue took over a second to draw on a phone, and
 * again after every approval (PERF-1). The oldest come first, as before.
 */
const PAGE = 25

/**
 * Why a row arrives with a category picked, when the owner has not picked
 * one: a learned rule for its shop, the AI's suggestion (0018), or a shop
 * that starts the same way as one filed before (similarMerchant, never
 * stored). Each is only picked; the owner still taps Approve.
 */
type SuggestionKind = 'rule' | 'model' | 'similar'

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
/** The line under the title with no charges waiting but an AI app's suggestions above. */
const suggestedWaiting = (n: number) => `No charges waiting. ${n === 1 ? '1 suggested change waits' : `${n} suggested changes wait`} below.`

export function ReviewScreen() {
  const { supabase, userId, categories, refresh, version, status, suggestedTotal } = useAppData()
  const [rows, setRows] = useState<readonly PendingCandidate[] | null>(null)
  const [unreadable, setUnreadable] = useState<UnreadablePage | null>(null)
  const [total, setTotal] = useState(0)
  const [rules, setRules] = useState<ReadonlyMap<string, string>>(new Map())
  // Which AI app added each such row, by its grant's name (PLAN §2.9).
  const [byApp, setByApp] = useState<ReadonlyMap<string, string>>(new Map())
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
  const list = useRef<HTMLUListElement>(null)
  const focusFrom = useFocusDrawn(list, drawn)

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

  useEffect(() => {
    const added = (rows ?? []).filter((r) => r.source === 'ai_app')
    if (added.length === 0) return
    let live = true
    void addedBy(supabase, added).then((names) => {
      if (live) setByApp(names)
    })
    return () => void (live = false)
  }, [supabase, rows])

  // The AI's suggestions are stored; a similar shop's category is worked
  // out here, for rows with neither a rule nor a stored suggestion.
  const named = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const similar = useMemo(() => {
    const learned = [...rules.keys()]
    const hints = new Map<string, string>()
    for (const row of rows ?? []) {
      if (rules.has(row.merchant) || row.category_source === 'model') continue
      const shop = similarMerchant(row.merchant, learned)
      const category = shop === null ? undefined : rules.get(shop)
      if (category !== undefined) hints.set(row.id, category)
    }
    return hints
  }, [rows, rules])
  const suggestionFor = (row: PendingCandidate): { kind: SuggestionKind; id: string } | null => {
    const rule = rules.get(row.merchant)
    if (rule !== undefined) return { kind: 'rule', id: rule }
    if (row.category_source === 'model' && row.category_id !== null && named.has(row.category_id)) return { kind: 'model', id: row.category_id }
    const hint = similar.get(row.id)
    return hint === undefined ? null : { kind: 'similar', id: hint }
  }
  const categoryFor = (row: PendingCandidate) => picked[row.id] ?? suggestionFor(row)?.id ?? ''

  const input = useMemo(
    () =>
      rows === null || status !== 'ready'
        ? null
        : {
            rows: rows.map((r) => ({ id: r.id, merchant: r.merchant, amountCents: r.amount_cents, categoryId: r.category_id })),
            categories,
            learned: new Set(rules.keys()),
          },
    [rows, status, categories, rules],
  )
  const suggestions = useSuggestions(input, load)

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
    // refresh() moves `version` on, and that reloads the queue; reloading it
    // here as well read it twice per approval (PERF-2). It is off the list at
    // once, so a refresh that fails does not leave it showing.
    if (done) {
      // A read already out was asked before this action, and would put the
      // card back, Approve working, when it lands (CR-13). Only reads begun
      // from here on may draw the queue.
      reads.current += 1
      setRows((now) => now?.filter((r) => r.id !== row.id) ?? null)
      await refresh()
    }
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

  // Not this: the suggestion goes, so the row waits with nothing picked.
  const clear = async (row: PendingCandidate) => {
    setBusy(row.id)
    setNote(null)
    setError(null)
    try {
      await clearCandidateSuggestion(supabase, row.id)
      // As in act: a read already out was asked while the suggestion stood,
      // and would draw it again when it lands (c2ad3fe).
      reads.current += 1
      setRows((now) => now?.map((r) => (r.id === row.id ? { ...r, category_id: null, category_source: null } : r)) ?? null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Nothing was changed.')
    } finally {
      setBusy(null)
    }
  }
  const latestClear = useRef(clear)
  useLayoutEffect(() => {
    latestClear.current = clear
  })
  const onClear = useCallback((row: PendingCandidate) => void latestClear.current(row), [])

  // Approve these N: every row loaded with a category picked, whoever
  // picked it. The question lists them as they stand, so a row changed
  // while it is open is approved as it now shows.
  const ready = (rows ?? []).flatMap((row) => {
    const categoryId = categoryFor(row)
    const name = named.get(categoryId)
    // The AI's own pick, not the owner's, is marked in the question (c2ad3fe).
    const byAi = picked[row.id] === undefined && suggestionFor(row)?.kind === 'model'
    return name === undefined ? [] : [{ row, categoryId, name, byAi }]
  })
  const [confirming, setConfirming] = useState(false)
  const approveAll = async (list: typeof ready) => {
    setBusy(ALL)
    setNote(null)
    setError(null)
    let done = 0
    try {
      // One at a time, each approve_candidate's own conditional write; the
      // first that fails stops the rest.
      for (const { row, categoryId } of list) {
        await approveCandidate(supabase, row.id, categoryId)
        done += 1
        // As in act: a read already out would put the filed card back (CR-13).
        reads.current += 1
        setRows((now) => now?.filter((r) => r.id !== row.id) ?? null)
      }
      setNote(`Filed ${done}. Future charges from these shops will be filed the same way automatically.`)
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : 'That did not work.'
      // Those filed were saved: never "nothing was saved" after them (e2e-money-09).
      setError(done === 0 ? `0 of ${list.length} were filed, then this: ${why}` : `${done} of ${list.length} were filed; the other ${list.length - done} were not: ${afterSomeSaved(why)}`)
    } finally {
      setBusy(null)
      setConfirming(false)
    }
    if (done > 0) await refresh()
    said.current?.focus()
  }

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
    // Mockup A: the Month's title with waiting's amber count, Suggest
    // categories and Approve these N on the title row's right; each row a
    // flat card, and the unreadable lines in waiting's amber (ADR 0010).
    <div className="space-y-4 md:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <MonthTitle>Review</MonthTitle>
            {/* The line under the title says the number; this is its picture. */}
            {rows !== null && total > 0 ? (
              <span aria-hidden="true" className="tnum flex h-7 min-w-7 items-center justify-center rounded-full bg-waiting-tile px-2 text-sm font-semibold text-waiting-ink">
                {total}
              </span>
            ) : null}
            <HelpButton screen="review" />
          </div>
          <p className="mt-1 text-sm text-muted-foreground md:text-base">
            {rows === null ? 'Loading…' : total > 0 ? `${total} waiting for a category.` : suggestedTotal > 0 ? suggestedWaiting(suggestedTotal) : 'Nothing waiting.'}{' '}
            Nothing reaches your budget until you approve it.
          </p>
        </div>
        {suggestOffered(suggestions.status, suggestions.waiting) || (ready.length >= 2 && !confirming) ? (
          <div className="flex flex-wrap gap-2">
            {suggestOffered(suggestions.status, suggestions.waiting) ? <SuggestButton onSuggest={suggestions.suggest} /> : null}
            {ready.length >= 2 && !confirming ? <ApproveAllButton n={ready.length} busy={busy !== null} onOpen={() => setConfirming(true)} /> : null}
          </div>
        ) : null}
      </header>

      <SuggestLine status={suggestions.status} />

      {confirming && ready.length > 0 ? (
        <ApproveAll
          items={ready.map((r) => ({ id: r.row.id, shop: r.row.merchant_raw, category: r.name, byAi: r.byAi }))}
          busy={busy !== null}
          onConfirm={() => void approveAll(ready)}
          onCancel={() => setConfirming(false)}
        />
      ) : null}

      <div ref={said} tabIndex={-1} className="space-y-4 outline-none empty:hidden">
        {note !== null ? <Alert tone="success">{note}</Alert> : null}
        {/* Errors sit above the list and do NOT replace it: a single failure used
            to swap the whole queue for an error card until the page was reloaded. */}
        {(error ?? loadError) !== null ? <Alert tone="error" title="That did not work">{error ?? loadError}</Alert> : null}
      </div>

      {/* What a connected AI app suggested, above the rows waiting (ADR 0013). */}
      <SuggestedChanges />

      {/* Not "All caught up" while an AI app's suggestions wait above. */}
      {rows !== null && rows.length === 0 && unreadable?.total === 0 && suggestedTotal === 0 ? (
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

      <ul ref={list} className="space-y-3">
        {(rows ?? []).slice(0, drawn).map((row) => {
          const suggestion = picked[row.id] === undefined ? suggestionFor(row) : null
          return (
            <ReviewRow
              key={row.id}
              row={row}
              categoryId={categoryFor(row)}
              suggestion={suggestion?.kind ?? null}
              suggestedName={suggestion === null ? null : (named.get(suggestion.id) ?? null)}
              addedBy={byApp.get(row.id) ?? 'an AI app'}
              categories={categories}
              busy={busy === row.id || busy === ALL}
              onPick={onPick}
              onApprove={onApprove}
              onReject={onReject}
              onClear={onClear}
            />
          )
        })}
      </ul>

      {rows !== null && rows.length > drawn ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            focusFrom(drawn)
            setDrawn((n) => n + PAGE)
          }}
        >
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
  suggestion,
  suggestedName,
  addedBy,
  categories,
  busy,
  onPick,
  onApprove,
  onReject,
  onClear,
}: {
  row: PendingCandidate
  categoryId: string
  suggestion: SuggestionKind | null
  suggestedName: string | null
  /** The AI app that added it, when its source is one; drawn as text. */
  addedBy: string
  categories: readonly Category[]
  busy: boolean
  onPick: (rowId: string, id: string) => void
  onApprove: (row: PendingCandidate, created?: NewName) => void
  onReject: (row: PendingCandidate) => void
  onClear: (row: PendingCandidate) => void
}) {
  const [newName, setNewName] = useState('')
  // A charge most likely belongs in Variable expenses. Money in could be a
  // refund, a card payment or pay, so nothing is assumed for it.
  const [newKind, setNewKind] = useState<CategoryKind | ''>(row.amount_cents < 0 ? 'variable' : '')
  const creating = categoryId === NEW_CATEGORY
  const ready = creating ? newName.trim().length > 0 && newKind !== '' : categoryId !== ''
  // Not this goes with the suggestion, and focus fell to the page: once the
  // suggestion is gone, the row's Category takes it, what to do next (e2e-money-03).
  const picker = useRef<HTMLSelectElement>(null)
  const clearing = useRef(false)
  useEffect(() => {
    if (!clearing.current || suggestion === 'model') return
    clearing.current = false
    const now = document.activeElement
    if (now === null || now === document.body) picker.current?.focus()
  }, [suggestion])

  return (
    <li>
      <Card className={cn('p-4 transition-opacity md:px-5 md:py-[1.125rem]', busy && 'opacity-60')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {/* As the statement printed it, in the mockup's fixed-width face. */}
            <p className="font-mono text-[0.9375rem] font-semibold leading-snug [overflow-wrap:anywhere]">
              <IngestedText>{row.merchant_raw}</IngestedText>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground md:text-[0.8125rem]">
              {formatIsoDate(row.posted_on)}
              {row.source === 'ai_app' ? ` · Added by ${addedBy}` : ''}
            </p>
          </div>
          <span className={cn('tnum shrink-0 text-lg font-bold tracking-[-0.01em]', row.amount_cents < 0 ? 'text-foreground' : 'text-income')}>
            {formatCents(row.amount_cents)}
          </span>
        </div>

        {/* The picker, Approve and ✕ on one line from 480px; on a narrower
          phone the picker takes its own line. A new category's name and
          list stack under the picker, in the order they are filled in. */}
        <div className="mt-3.5 flex flex-col gap-2 min-[480px]:grid min-[480px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[480px]:items-start">
          <div className="flex min-w-0 flex-col gap-2">
            <NativeSelect
              ref={picker}
              aria-label="Category"
              value={categoryId}
              onChange={(e) => onPick(row.id, e.target.value)}
              disabled={busy}
            >
              <option value="">Choose a category…</option>
              <CategoryOptions categories={categories} />
              <option value={NEW_CATEGORY}>+ New category…</option>
            </NativeSelect>
            {creating ? (
              <>
                <Input
                  autoFocus
                  aria-label={`Name of the new category for ${row.merchant_raw}`}
                  disabled={busy}
                  placeholder="Category name, e.g. Groceries"
                  value={newName}
                  maxLength={60}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <ListSelect value={newKind} onChange={setNewKind} disabled={busy} />
              </>
            ) : null}
          </div>
          <div className="flex gap-2 min-[480px]:contents">
            <Button
              size="tall"
              className="flex-1 min-[480px]:flex-none"
              disabled={!ready || busy}
              onClick={() => onApprove(row, creating && newKind !== '' ? { name: newName.trim(), kind: newKind } : undefined)}
            >
              <Icon name="check" /> Approve
            </Button>
            <Button variant="outline" size="icon-lg" aria-label="Not a real transaction — remove" disabled={busy} onClick={() => onReject(row)}>
              <Icon name="x" className="text-muted-foreground" />
            </Button>
          </div>
        </div>
        {suggestion === 'rule' ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:text-[0.8125rem]">
            <Badge variant="outline">
              <Icon name="sparkles" className="size-3" /> Suggested
            </Badge>
            How you filed this merchant last time.
          </p>
        ) : suggestion === 'model' ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground md:text-[0.8125rem]">
            <Badge variant="outline" className="max-w-full min-w-0">
              <span className="truncate">✨ Suggested: {suggestedName}</span>
            </Badge>
            <span>By AI from the shop’s name. Check it.</span>
            <Button variant="ghost" size="sm" className="-my-1 underline underline-offset-4" disabled={busy}
              onClick={() => {
                clearing.current = true
                onClear(row)
              }}
            >
              Not this
            </Button>
          </div>
        ) : suggestion === 'similar' ? (
          <p className="mt-3 text-xs text-muted-foreground md:text-[0.8125rem]">You filed a similar shop under {suggestedName}.</p>
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
  ai_app: 'Added by an AI app',
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
    // Waiting's amber (ADR 0010): lines left out, waiting for the owner.
    <section aria-labelledby="unreadable-title" className="rounded-xl border border-waiting-border bg-waiting p-4 md:px-5 md:py-[1.125rem]">
      <div>
        <div className="flex items-center gap-2">
          <Icon name="alert" className="size-[1.125rem] shrink-0 text-waiting-icon" />
          <h2 id="unreadable-title" className="font-semibold md:text-base">
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
                    <li key={line.id} className={cn('flex flex-wrap items-center gap-3 text-sm', busy === line.id && 'opacity-60')}>
                      <span className="tnum w-16 shrink-0 text-muted-foreground">{where}</span>
                      <span className="flex-1">{describeReason(line.reason)}</span>
                      <Button
                        variant="outline"
                        size="sm"
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
      </div>
    </section>
  )
}
