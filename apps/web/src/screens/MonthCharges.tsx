import { useState } from 'react'
import { useAppData } from '../app-data.js'
import { recategoriseTransaction, type LedgerRow } from '../ledger.js'
import { CategoryOptions } from '../lists.js'
import { formatCents, formatIsoDate, formatMonthName, formatMonthTitle } from '../format.js'
import { IngestedText } from '../ui.js'
import { Sheet } from '../components/ui/sheet.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { NativeSelect } from '../components/ui/form.js'
import { cn } from '../lib/cn.js'

/**
 * One Month row opened: the charges filed under that category in the month
 * (plan §6.2). The Actual is the engine's, passed in from monthSheet; the
 * charges are the month's ledger rows for the category, newest first, shown
 * as they are and never added up here.
 *
 * Merchant text came from a statement or a photo, so it goes through
 * IngestedText and is only ever text.
 *
 * Each charge can be moved to another category from here (S6). After a move
 * the app's data is refreshed, which re-reads the month, so the charge leaves
 * this list and every total on the Month is the engine's again.
 *
 * A bill with nothing filed shows its planned amount (D5); the sheet says
 * where that came from, or its Actual would stand over "No charges" with
 * nothing to explain it.
 */
const FIRST = 30

export function MonthCharges({
  categoryId,
  name,
  heading,
  month,
  actualCents,
  basis,
  charges,
  onClose,
}: {
  categoryId: string
  name: string
  /** The Workbook list the category is on, e.g. "Variable expenses". */
  heading: string
  /** The month's first day. */
  month: string
  actualCents: number
  /** What made the Actual, from core: 'planned' is the monthly amount from Setup. */
  basis: 'real' | 'planned' | 'none'
  charges: readonly LedgerRow[]
  onClose: () => void
}) {
  const monthName = formatMonthTitle(month)
  const [moving, setMoving] = useState<string | null>(null)
  const [moved, setMoved] = useState<{ readonly merchant: string; readonly to: string } | null>(null)
  // The newest 30 (the month is read newest first), then all on request: a
  // category with 208 charges, each with its Move to… button, took up to
  // 232 ms to open on a phone (PERF-4).
  const [all, setAll] = useState(false)
  const shown = all ? charges : charges.slice(0, FIRST)
  return (
    <Sheet
      title={name}
      subtitle={
        <>
          {heading} · {monthName} · <span className="tnum">{formatCents(actualCents)}</span>
          {basis === 'planned' ? ' planned' : null}
        </>
      }
      onClose={onClose}
    >
      {moved !== null ? (
        <div className="px-4 pt-3">
          <Alert tone="success">
            Moved <IngestedText>{moved.merchant}</IngestedText> to {moved.to}.
          </Alert>
        </div>
      ) : null}
      {charges.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No charges filed here in {formatMonthName(month)}.
          {basis === 'planned'
            ? ' The amount above is its monthly amount from Setup. A charge filed here counts instead.'
            : null}
        </p>
      ) : (
        <ul aria-label="Charges" className="divide-y">
          {shown.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                    <IngestedText>{c.merchant_raw}</IngestedText>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatIsoDate(c.posted_on)}
                    {c.source === 'typed' ? ' · added by hand' : ''}
                  </p>
                </div>
                <span className={cn('tnum shrink-0 text-sm font-semibold', c.amount_cents > 0 && 'text-income')}>
                  {formatCents(c.amount_cents)}
                </span>
              </div>
              {moving === c.id ? (
                <MoveCharge
                  charge={c}
                  from={categoryId}
                  onCancel={() => setMoving(null)}
                  onMoved={(to) => {
                    setMoving(null)
                    setMoved({ merchant: c.merchant_raw, to })
                  }}
                />
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  aria-label={`Move to… (${c.merchant_raw}, ${formatIsoDate(c.posted_on)})`}
                  onClick={() => {
                    setMoved(null)
                    setMoving(c.id)
                  }}
                >
                  Move to…
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {shown.length < charges.length ? (
        <div className="border-t p-4">
          <Button variant="outline" className="w-full" onClick={() => setAll(true)}>
            Show all {charges.length}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/**
 * Where one charge goes: a category picker under Workbook's headings, and
 * "Always file <shop> here", on by default, which also re-points the shop's
 * learned rule so the next statement files it in the new place. Off, only
 * this charge moves.
 */
function MoveCharge({
  charge,
  from,
  onCancel,
  onMoved,
}: {
  charge: LedgerRow
  from: string
  onCancel: () => void
  onMoved: (to: string) => void
}) {
  const { supabase, categories, refresh } = useAppData()
  const [to, setTo] = useState('')
  const [learn, setLearn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const target = categories.find((k) => k.id === to)

  const move = async () => {
    if (target === undefined) return
    setBusy(true)
    setError(null)
    try {
      await recategoriseTransaction(supabase, { transactionId: charge.id, categoryId: target.id, learn })
      onMoved(target.name)
      // Re-reads the categories and, through `version`, the month itself.
      await refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not move this charge. Nothing was moved.')
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/40 p-3">
      <NativeSelect aria-label="Move to" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)}>
        <option value="" disabled>
          Choose a category
        </option>
        <CategoryOptions categories={categories.filter((k) => k.id !== from)} />
      </NativeSelect>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          checked={learn}
          disabled={busy}
          onChange={(e) => setLearn(e.target.checked)}
        />
        <span className="min-w-0 break-words [overflow-wrap:anywhere]">
          {/* Inside a sheet titled with the category the charge is leaving,
            "here" reads as that one, so once a category is chosen it is named. */}
          Always file <IngestedText>{charge.merchant_raw}</IngestedText>{' '}
          {target === undefined ? 'here' : `in ${target.name}`}
        </span>
      </label>
      {error !== null ? (
        <Alert tone="error" title="Could not move this charge">
          {error}
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy || target === undefined} onClick={() => void move()}>
          {busy ? 'Moving…' : 'Move'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
