import { useEffect, useState } from 'react'
import { historyStart, isoDate, monthBounds, shiftMonth, starterBudgets, type StarterBudgets } from '@budget/core'
import { useAppData } from '../app-data.js'
import { getMonthBalance, listBudgetHistory, listTransactions, needsOneTimeUpdate, readRecordsStart, setBudget } from '../ledger.js'
import { budgetsForCore, categoriesForCore, entriesForCore } from '../sheet-input.js'
import { formatCents, formatMonthName, todayIso } from '../format.js'
import { hashOf } from '../nav.js'
import { StatementImport } from '../screens/AddScreen.js'
import { StartEditor } from '../screens/StartEditor.js'
import { Alert, SavedNote } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { SENTENCE_LINK } from '../components/ui/link.js'

/**
 * Step 6, your first statement and filing it: Add's own statement reader,
 * then Review, where each charge waits for its category. Done once a
 * statement is in and nothing waits.
 */
export function StatementStep() {
  const { pendingTotal } = useAppData()
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h3 className="font-medium">1. Bring in your card statement</h3>
        <p className="text-sm text-muted-foreground">Download it from your card’s website as a PDF or CSV, then choose it here.</p>
        <StatementImport />
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">2. File each charge</h3>
        <p className="text-sm">
          {pendingTotal === 0 ? 'Nothing is waiting in Review.' : `${pendingTotal} ${pendingTotal === 1 ? 'charge is' : 'charges are'} waiting in Review.`}
        </p>
        <a href={hashOf({ screen: 'review', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
          Open Review
        </a>
      </div>
    </div>
  )
}

type Read<T> = { readonly status: 'loading' } | { readonly status: 'failed'; readonly missingUpdate: boolean } | { readonly status: 'ready'; readonly value: T }

/**
 * Step 7, this month's starting balance: the Month's own editor, then a
 * starter budget for each spending category that has none (F43), each
 * written only when Accept is pressed, "from this month on" (D12).
 */
export function BalanceStep() {
  const { supabase, version } = useAppData()
  const month = monthBounds(isoDate(todayIso())).start
  const [start, setStart] = useState<Read<number | null>>({ status: 'loading' })
  const [note, setNote] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)

  useEffect(() => {
    if (version === 0) return
    let live = true
    getMonthBalance(supabase, month).then(
      (value) => live && setStart({ status: 'ready', value }),
      (cause: unknown) => live && setStart({ status: 'failed', missingUpdate: needsOneTimeUpdate(cause) }),
    )
    return () => {
      live = false
    }
  }, [supabase, month, version])

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-medium">What your bank showed on 1 {formatMonthName(month)}</h3>
        {start.status === 'loading' ? <p className="text-sm text-muted-foreground">Reading…</p> : null}
        {start.status === 'failed' ? <Unread missingUpdate={start.missingUpdate} what="This month’s starting balance" /> : null}
        {start.status === 'ready' ? (
          <StartEditor
            key={String(start.value)}
            month={month}
            start={start.value}
            autoFocus={false}
            onSaved={(text) => setNote({ ok: true, text })}
            onFailedAfterClose={(text) => setNote({ ok: false, text })}
          />
        ) : null}
        {note === null ? null : note.ok ? (
          <SavedNote className="mt-2 text-sm text-income">{note.text}</SavedNote>
        ) : (
          <Alert tone="error">{note.text}</Alert>
        )}
      </div>
      <StarterOffers month={month} />
    </div>
  )
}

/** One line for a read that failed, pointing to One-time updates when that is why. */
function Unread({ missingUpdate, what }: { missingUpdate: boolean; what: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      {missingUpdate ? `${what} needs a one-time update. ` : `${what} could not be read just now. `}
      <a href={hashOf({ screen: 'help', param: 'updates' })} className={SENTENCE_LINK}>
        One-time updates
      </a>
    </p>
  )
}

/** The three months before this one, read for F43; every figure is core's. */
function useStarterBudgets(month: string): Read<StarterBudgets> {
  const { supabase, categories, version } = useAppData()
  const [read, setRead] = useState<Read<StarterBudgets>>({ status: 'loading' })
  useEffect(() => {
    if (version === 0) return
    let live = true
    const readFrom = shiftMonth(isoDate(month), -3)
    Promise.all([listTransactions(supabase, { from: readFrom, to: monthBounds(isoDate(month)).end }), listBudgetHistory(supabase, month), readRecordsStart(supabase)])
      .then(([rows, budgets, records]) => {
        const start = historyStart({ statementPeriodStarts: records.statementStarts.map((d) => isoDate(d)), entryDates: records.entryDates.map((d) => isoDate(d)) })
        const value = starterBudgets({
          asOf: isoDate(todayIso()),
          historyStart: start.start,
          readFrom,
          categories: categoriesForCore(categories),
          entries: entriesForCore(rows),
          budgetHistory: budgetsForCore(budgets),
        })
        if (live) setRead({ status: 'ready', value })
      })
      .catch((cause: unknown) => live && setRead({ status: 'failed', missingUpdate: needsOneTimeUpdate(cause) }))
    return () => {
      live = false
    }
  }, [supabase, categories, month, version])
  return read
}

/** Starter budgets (F43): each offered with its own Accept, and all at once. */
function StarterOffers({ month }: { month: string }) {
  const { supabase, userId, categories, refresh } = useAppData()
  const read = useStarterBudgets(month)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const accept = async (offers: StarterBudgets['offers']) => {
    setBusy(true)
    setProblem(null)
    try {
      for (const offer of offers) {
        await setBudget(supabase, { userId, categoryId: offer.categoryId, month, applies: 'onward', budgetCents: offer.budgetCents, replacesOnly: false })
      }
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'That budget was not saved. Try again.')
    }
    // Re-reads the budgets: an accepted one is in effect now, so it is no longer offered.
    await refresh()
    setBusy(false)
  }

  if (read.status === 'loading') return null
  if (read.status === 'failed') return <Unread missingUpdate={read.missingUpdate} what="Starter budgets" />
  const { offers, completeMonths } = read.value
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? ''
  return (
    <section aria-labelledby="start-budgets" className="space-y-2">
      <h3 id="start-budgets" className="font-medium">
        Starter budgets
      </h3>
      {completeMonths === 0 ? (
        <p className="text-sm text-muted-foreground">
          Once a whole month of your records is in, this offers a budget for each spending category, from what you really spent.
        </p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every spending category already has a budget, or nothing to base one on.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            What you usually spend, rounded up to $5. Nothing is saved until you press Accept; each applies from this month on, and you can change it on the Month.
          </p>
          <ul className="divide-y rounded-xl border bg-card px-4">
            {offers.map((offer) => (
              <li key={offer.categoryId} className="flex min-w-0 items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate" title={nameOf(offer.categoryId)}>
                  {nameOf(offer.categoryId)}
                </span>
                <span className="tnum shrink-0 text-sm font-medium">{formatCents(offer.budgetCents)}</span>
                <Button size="sm" variant="outline" disabled={busy} aria-label={`Accept ${formatCents(offer.budgetCents)} for ${nameOf(offer.categoryId)}`} onClick={() => void accept([offer])}>
                  Accept
                </Button>
              </li>
            ))}
          </ul>
          {offers.length > 1 ? (
            <Button variant="outline" disabled={busy} onClick={() => void accept(offers)}>
              Accept all {offers.length}
            </Button>
          ) : null}
        </>
      )}
      {problem === null ? null : <Alert tone="error">{problem}</Alert>}
    </section>
  )
}
