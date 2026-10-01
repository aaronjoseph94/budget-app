import { useRef, useState } from 'react'
import { timeEquivalent, type PeriodComparison, type PeriodSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import { recategoriseTransaction, type LedgerRow } from '../ledger.js'
import { CategoryOptions, LIST_HEADING } from '../lists.js'
import { formatCents, formatIsoDate, formatMinutes, formatMonthName, formatMonthTitle } from '../format.js'
import { IngestedText } from '../ui.js'
import { Sheet } from '../components/ui/sheet.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { NativeSelect } from '../components/ui/form.js'
import { cn } from '../lib/cn.js'
import { useFocusDrawn } from '../lib/return-focus.js'

/** Charges drawn before "Show all" (PERF-4). */
const FIRST = 30

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
 *
 * `lastMonth` is what the category came to over the same days last month,
 * from periodComparison (D26); null when there is no comparison.
 *
 * `toward` is the main goal, on a Variable expenses row when that goal has a
 * cost an hour: each charge then says what it cost in the goal's time
 * (timeEquivalent, D29), the tradeoff the savings coach is built on. A
 * refund, or a charge under half a minute, says nothing.
 */
export function MonthCharges({
  name,
  heading,
  month,
  actualCents,
  basis,
  charges,
  lastMonth = null,
  toward = null,
  period = null,
  onClose,
}: {
  name: string
  /** The list the category is on, e.g. "Variable expenses". */
  heading: string
  /** The month's first day. */
  month: string
  actualCents: number
  /** What made the Actual, from core: 'planned' is the monthly amount from Setup. */
  basis: 'real' | 'planned' | 'none'
  charges: readonly LedgerRow[]
  lastMonth?: { readonly label: string; readonly cents: number } | null
  toward?: { readonly goalName: string; readonly unitCostCents: number } | null
  /** A week or a pay period, in place of the month, for the Week and Paycheck (N46, N48). */
  period?: Period | null
  onClose: () => void
}) {
  const monthName = period?.title ?? formatMonthTitle(month)
  const [moving, setMoving] = useState<string | null>(null)
  const [moved, setMoved] = useState<{ readonly merchant: string; readonly to: string } | null>(null)
  // The newest 30 (the month is read newest first), then all on request: a
  // category with 208 charges, each with its Move to… button, took up to
  // 232 ms to open on a phone (PERF-4).
  const [all, setAll] = useState(false)
  const shown = all ? charges : charges.slice(0, FIRST)
  const list = useRef<HTMLUListElement>(null)
  const focusFrom = useFocusDrawn(list, shown.length)
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
      {lastMonth === null ? null : (
        <p className="border-b px-4 py-3 text-sm text-muted-foreground">
          {lastMonth.label}: <span className="tnum font-medium text-foreground">{formatCents(lastMonth.cents)}</span>
        </p>
      )}
      {moved !== null ? (
        <div className="px-4 pt-3">
          <Alert tone="success">
            Moved <IngestedText>{moved.merchant}</IngestedText> to {moved.to}.
          </Alert>
        </div>
      ) : null}
      {charges.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No charges filed here in {period?.inWords ?? formatMonthName(month)}.
          {basis === 'planned'
            ? ' The amount above is its monthly amount from Setup. A charge filed here counts instead.'
            : null}
        </p>
      ) : (
        <ul ref={list} aria-label="Charges" className="divide-y">
          {shown.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                    <IngestedText>{c.merchant_raw}</IngestedText>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatIsoDate(c.posted_on)}
                    {c.source === 'typed' ? ' · added by hand' : c.source === 'ai_app' ? ' · added by an AI app' : ''}
                  </p>
                  <TimeToward charge={c} toward={toward} />
                </div>
                <span className={cn('tnum shrink-0 text-sm font-semibold', c.amount_cents > 0 && 'text-income')}>
                  {formatCents(c.amount_cents)}
                </span>
              </div>
              {moving === c.id ? (
                <MoveCharge
                  charge={c}
                  // Its own: Not spending's sheet holds several categories (N26).
                  from={c.category_id}
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
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              focusFrom(FIRST)
              setAll(true)
            }}
          >
            Show all {charges.length}
          </Button>
        </div>
      ) : null}
    </Sheet>
  )
}

/** Opens Not spending's charges, which have no block of their own (N26). */
export const NOT_SPENDING = 'not-spending'

/** A period other than a month: its dates as a title, and as said in a sentence. */
export interface Period {
  readonly title: string
  readonly inWords: string
  /** What the comparison line calls the period before, e.g. "Last week". */
  readonly before: string
}

/**
 * An opened row's charges, found by id in the blocks the screen shows, so
 * its name, list and Actual are the ones on screen. A category gone after a
 * reload has nothing to show, and the sheet closes rather than show a stale
 * row. The Month, the Week and Paycheck each open their rows through this
 * (N46, N48); `rows` are the period's own ledger rows.
 */
export function OpenedCharges({
  blocks,
  transfersCents,
  rows,
  categoryId,
  month,
  period = null,
  compared = null,
  onClose,
}: {
  blocks: PeriodSheet['blocks']
  /** Not spending's figure, core's, for its sheet's title. */
  transfersCents: number
  rows: readonly LedgerRow[]
  /** A category's id, or NOT_SPENDING. */
  categoryId: string
  /** The month holding the period's first day; the Month's own month. */
  month: string
  period?: Period | null
  compared?: Extract<PeriodComparison, { status: 'compared' }> | null
  onClose: () => void
}) {
  const { mainGoal, categories } = useAppData()
  if (categoryId === NOT_SPENDING) {
    // A card payment or a move out, filed where nothing counts it: a
    // purchase filed here by mistake is reached and moved back from here.
    const kinds = new Map(categories.map((c) => [c.id, c.kind]))
    return (
      <MonthCharges
        name={LIST_HEADING.transfer}
        heading="Not counted"
        month={month}
        period={period}
        actualCents={transfersCents}
        basis="real"
        charges={rows.filter((r) => kinds.get(r.category_id) === 'transfer')}
        onClose={onClose}
      />
    )
  }
  for (const kind of Object.keys(blocks) as (keyof PeriodSheet['blocks'])[]) {
    const row = blocks[kind].rows.find((r) => r.categoryId === categoryId)
    if (row === undefined) continue
    const before = compared?.blocks[kind].rows.find((r) => r.categoryId === categoryId)
    // A Variable charge in the main goal's time, when the goal has one (D29).
    const rate = kind === 'variable' && mainGoal !== null ? mainGoal.unit_cost_cents : null
    const earlier = period?.before ?? 'Last month'
    return (
      <MonthCharges
        name={row.name}
        heading={LIST_HEADING[kind]}
        month={month}
        period={period}
        actualCents={row.actualCents}
        basis={row.basis}
        charges={rows.filter((r) => r.category_id === categoryId)}
        lastMonth={
          compared === null || before === undefined
            ? null
            : { label: compared.sameDays ? `${earlier} (same days)` : earlier, cents: before.beforeCents }
        }
        toward={rate === null || mainGoal === null ? null : { goalName: mainGoal.name, unitCostCents: rate }}
        onClose={onClose}
      />
    )
  }
  return null
}

/** A charge's cost in the main goal's time: "= 22 min toward Flight training". */
function TimeToward({ charge, toward }: { charge: LedgerRow; toward: { readonly goalName: string; readonly unitCostCents: number } | null }) {
  // Only money spent: a charge is a negative row (D3), and its size is what it cost.
  if (toward === null || charge.amount_cents >= 0) return null
  const { totalMinutes } = timeEquivalent(Math.abs(charge.amount_cents), toward.unitCostCents)
  if (totalMinutes === 0) return null
  return (
    <p className="text-xs text-muted-foreground">
      = {formatMinutes(totalMinutes)} toward {toward.goalName}
    </p>
  )
}

/**
 * Where one charge goes: a category picker under the workbook's headings, and
 * "Always file <shop> here", on by default, which also re-points the shop's
 * learned rule so the next statement files it in the new place. Off, only
 * this charge moves. Never offered for a charge an AI app added: its words
 * are the AI's, and 0032 learns nothing from them (security review mcp-2-02).
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
  const canLearn = charge.source !== 'ai_app'

  const move = async () => {
    if (target === undefined) return
    setBusy(true)
    setError(null)
    try {
      await recategoriseTransaction(supabase, { transactionId: charge.id, categoryId: target.id, learn: canLearn && learn })
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
      {canLearn ? (
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
      ) : (
        <p className="text-sm text-muted-foreground">An AI app added this, so its words are not learned as a shop.</p>
      )}
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
