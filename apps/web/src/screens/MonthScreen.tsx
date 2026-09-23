import { useEffect, useMemo, useState } from 'react'
import { isoDate, monthBounds, monthSheet, shiftMonth, type PeriodBlock, type PeriodSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import { countPendingBetween, latestStatementEnd, listTransactions, type LedgerRow } from '../ledger.js'
import { LIST_HEADING } from '../lists.js'
import { navigate } from '../nav.js'
import { formatCents, formatIsoDate, formatMagnitude, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { MonthCharges } from './MonthCharges.js'

/**
 * One Workbook month tab (plan §6.2, §6.3). `month` is the address's `YYYY-MM`,
 * or null for this month; the arrows step through shiftMonth in packages/core
 * and write the month they land on into the address, so a refresh or the
 * back gesture returns to it.
 *
 * Every number is monthSheet's, from packages/core, over the whole month's
 * ledger; this screen only formats them. Nothing unreviewed is in it.
 */
export function MonthScreen({ month }: { month: string | null }) {
  const { supabase, categories, pendingTotal, version } = useAppData()
  const { start, end } = monthBounds(isoDate(month === null ? todayIso() : `${month}-01`))
  const step = (months: number) => navigate('month', shiftMonth(start, months).slice(0, 7))
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The category whose charges are open, by id; a new month closes it.
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => setOpened(null), [start])

  useEffect(() => {
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      latestStatementEnd(supabase),
      countPendingBetween(supabase, { from: start, to: end }),
    ])
      .then(([rows, ends, pendingHere]) => live && setLoaded({ start, rows, ends, pendingHere }))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this month.'))
    return () => {
      live = false
    }
  }, [supabase, start, end, version])

  // A month's rows only ever fill that month: while the next one loads, the
  // screen waits rather than show last month's charges under this title.
  const here = loaded !== null && loaded.start === start ? loaded : null
  const sheet = useMemo((): PeriodSheet | string | null => {
    if (here === null) return null
    try {
      return monthSheet({
        asOf: start,
        categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind, sortOrder: c.sort_order })),
        // Budgets and monthly amounts are stored from Sitting B (S8, S9).
        budgets: [],
        plans: [],
        entries: here.rows.map((r) => ({
          postedOn: isoDate(r.posted_on),
          amountCents: r.amount_cents,
          categoryId: r.category_id,
        })),
        statementPeriodEnds: here.ends.map((e) => isoDate(e)),
      })
    } catch {
      // The engine refuses a charge whose category it was not given rather
      // than leave it out of every total. Said plainly, never as its message.
      return 'A charge this month is filed under a category that did not load, so the month is not shown. Reload to try again.'
    }
  }, [here, categories, start])

  return (
    <div className="space-y-4">
      <header className="-mx-4 flex items-center justify-between gap-2 bg-title-band px-4 py-4 md:mx-0 md:rounded-xl">
        <MonthTitle>{formatMonthTitle(start)}</MonthTitle>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
        </div>
      </header>

      {error !== null ? (
        <Alert tone="error" title="Could not load this month">
          {error}
        </Alert>
      ) : null}
      {typeof sheet === 'string' ? (
        <Alert tone="error" title="Could not show this month">
          {sheet}
        </Alert>
      ) : null}
      {sheet === null && error === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {here !== null ? <ReviewBanner month={start} pendingHere={here.pendingHere} pendingTotal={pendingTotal} /> : null}

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <p className="text-sm text-muted-foreground">
            {sheet.importedThrough === null
              ? 'No statement imported yet.'
              : `Statement imported up to ${formatIsoDate(sheet.importedThrough)}`}
          </p>
          {/* Phones: the block every statement changes first (§6.2). Four
            columns on a desktop in Workbook's own arrangement, Jan!B3:V44 (§6.3). */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Summary sheet={sheet} />
            <Block kind="variable" block={sheet.blocks.variable} onOpen={setOpened} className="order-1 lg:order-7" />
            <Block kind="bill" block={sheet.blocks.bill} onOpen={setOpened} className="order-2 lg:order-4" />
            <Block kind="subscription" block={sheet.blocks.subscription} onOpen={setOpened} className="order-3 lg:order-6" />
            <Block kind="debt" block={sheet.blocks.debt} onOpen={setOpened} className="order-4 lg:order-5" />
            <Block kind="income" block={sheet.blocks.income} onOpen={setOpened} className="order-5 lg:order-2" />
            <Block kind="savings" block={sheet.blocks.savings} onOpen={setOpened} className="order-6 lg:order-3" />
          </div>
          {/* Left out of every block and total above, so said out loud (D9). */}
          {sheet.transfersCents !== 0 ? (
            <p className="text-sm text-muted-foreground">
              {sheet.transfersCents > 0 ? 'Paid to your card: ' : 'Moved out, not spending: '}
              <span className="tnum">{formatMagnitude(sheet.transfersCents)}</span> — not counted.
              {sheet.transfersCents > 0 ? ' What it paid for is already in the blocks above.' : ''}
            </p>
          ) : null}
          {here !== null && opened !== null ? (
            <OpenedRow sheet={sheet} rows={here.rows} categoryId={opened} month={start} onClose={() => setOpened(null)} />
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/**
 * The opened row's charges, found by id in the sheet the screen shows, so its
 * name, list and Actual are the ones on screen. A category gone after a reload
 * has nothing to show, and the sheet closes rather than show a stale row.
 */
function OpenedRow({
  sheet,
  rows,
  categoryId,
  month,
  onClose,
}: {
  sheet: PeriodSheet
  rows: readonly LedgerRow[]
  categoryId: string
  month: string
  onClose: () => void
}) {
  for (const kind of BLOCKS) {
    const row = sheet.blocks[kind].rows.find((r) => r.categoryId === categoryId)
    if (row === undefined) continue
    return (
      <MonthCharges
        categoryId={categoryId}
        name={row.name}
        heading={LIST_HEADING[kind]}
        month={month}
        actualCents={row.actualCents}
        charges={rows.filter((r) => r.category_id === categoryId)}
        onClose={onClose}
      />
    )
  }
  return null
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  readonly ends: readonly string[]
  /** Charges dated this month still waiting for review. */
  readonly pendingHere: number
}

/**
 * Where charges not filed yet live on the Month: one line at the top, with
 * their count and no amount, because nothing unreviewed is counted (CLAUDE.md
 * invariant 3). Tapping it opens Review. This month's count when it has any;
 * otherwise the queue's, which is then all from other months.
 */
function ReviewBanner({
  month,
  pendingHere,
  pendingTotal,
}: {
  month: string
  pendingHere: number
  pendingTotal: number
}) {
  if (pendingHere === 0 && pendingTotal === 0) return null
  return (
    <button
      type="button"
      onClick={() => navigate('review')}
      className="flex w-full items-center gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent"
    >
      <span className="rounded-full bg-warning/15 p-2 text-warning">
        <Icon name="inbox" className="size-4" />
      </span>
      <span className="flex-1 text-sm">
        {pendingHere > 0 ? (
          <>
            <span className="font-medium">
              Not filed yet: {pendingHere} from {formatMonthTitle(month).split(' ')[0]} waiting for review
            </span>{' '}
            <span className="text-muted-foreground">— not counted below</span>
          </>
        ) : (
          <span className="text-muted-foreground">{pendingTotal} from other months waiting for review</span>
        )}
      </span>
      <Icon name="chevronRight" className="size-4 text-muted-foreground" />
    </button>
  )
}

/**
 * Workbook's summary card, Jan!B7:F16. Spent and Left to spend now; Start and
 * End join when a starting balance can be typed (S11). The grid already has
 * room for them, and nothing stands in for them until then.
 */
function Summary({ sheet }: { sheet: PeriodSheet }) {
  const left = sheet.summary.leftToSpendCents
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  return (
    <section
      aria-label="Summary"
      className="order-0 rounded-xl border bg-summary p-4 shadow-sm md:col-span-2 lg:order-1"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div>
          <dt className="text-xs font-medium text-summary-label">Spent</dt>
          <dd className="text-2xl font-bold text-summary-value">
            <Figure>{formatCents(sheet.summary.spentCents)}</Figure>
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-summary-label">Left to spend</dt>
          <dd className={cn('text-2xl font-bold', left < 0 ? 'text-spend' : 'text-summary-value')}>
            <Figure>{formatCents(left)}</Figure>
          </dd>
          {/* Workbook takes a blank budget as $0, so every dollar spent comes off (F5). */}
          {noBudgets ? <dd className="mt-0.5 text-xs text-summary-label">No budgets set yet.</dd> : null}
        </div>
      </dl>
    </section>
  )
}

type BlockKind = keyof PeriodSheet['blocks']
const BLOCKS: readonly BlockKind[] = ['variable', 'bill', 'subscription', 'debt', 'income', 'savings']

/** Workbook's colours per block (§6.6): Bills, Debts and Subscriptions share one set. Written out for Tailwind. */
const TONE: Record<BlockKind, { band: string; header: string; ink: string; rule: string }> = {
  income: { band: 'bg-income-band', header: 'bg-income-header', ink: 'text-income-ink', rule: 'border-income-rule' },
  savings: {
    band: 'bg-savings-band',
    header: 'bg-savings-header',
    ink: 'text-savings-ink',
    rule: 'border-savings-rule',
  },
  bill: { band: 'bg-owed-band', header: 'bg-owed-header', ink: 'text-owed-ink', rule: 'border-owed-rule' },
  debt: { band: 'bg-owed-band', header: 'bg-owed-header', ink: 'text-owed-ink', rule: 'border-owed-rule' },
  subscription: { band: 'bg-owed-band', header: 'bg-owed-header', ink: 'text-owed-ink', rule: 'border-owed-rule' },
  variable: {
    band: 'bg-variable-band',
    header: 'bg-variable-header',
    ink: 'text-variable-ink',
    rule: 'border-variable-rule',
  },
}

/**
 * One block: its heading and Actual total on the band, then a row per
 * category on the list. A row with no budget and nothing this month folds
 * behind "Show N empty". Budget and Left columns join when budgets are
 * stored (S8); until then no row has one, so only Actual is shown.
 */
function Block({
  kind,
  block,
  onOpen,
  className,
}: {
  kind: BlockKind
  block: PeriodBlock
  onOpen: (categoryId: string) => void
  className: string
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  const tone = TONE[kind]
  const heading = LIST_HEADING[kind]
  const isEmpty = (r: PeriodBlock['rows'][number]) => r.basis === 'none' && r.budgetCents === null
  const empty = block.rows.filter(isEmpty).length
  const shown = showEmpty ? block.rows : block.rows.filter((r) => !isEmpty(r))

  return (
    <section
      aria-label={heading}
      className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', tone.rule, className)}
    >
      <div className={cn('flex items-baseline justify-between gap-3 px-4 py-3', tone.band, tone.ink)}>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{heading}</h2>
        <Figure className="text-lg font-bold">{formatCents(block.actualTotalCents)}</Figure>
      </div>
      {block.rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Nothing on this list yet.{' '}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => navigate('setup')}
          >
            Add one in Setup
          </button>
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className={cn(tone.header, tone.ink)}>
            <tr>
              <th scope="col" className="px-4 py-1.5 text-left text-xs font-medium">
                Category
              </th>
              <th scope="col" className="px-4 py-1.5 text-right text-xs font-medium">
                Actual
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              // The whole row takes a tap; the button in it is what a keyboard
              // or a screen reader reaches, named by the category.
              <tr
                key={r.categoryId}
                onClick={() => onOpen(r.categoryId)}
                className={cn('cursor-pointer border-t hover:bg-accent/60', tone.rule)}
              >
                <th scope="row" className="px-4 py-2 text-left font-normal">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpen(r.categoryId)
                    }}
                    className="break-words rounded-sm text-left underline-offset-4 outline-none [overflow-wrap:anywhere] hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {r.name}
                  </button>
                </th>
                {/* A zero on a budgeted row stays blank, as Workbook's ";;" format leaves it. */}
                <td className={cn('tnum whitespace-nowrap px-4 py-2 text-right', r.actualCents < 0 && 'text-spend')}>
                  {r.basis === 'planned' ? <span className="mr-1.5 text-xs text-muted-foreground">planned</span> : null}
                  {r.basis === 'none' ? '' : formatCents(r.actualCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {empty > 0 ? (
        <button
          type="button"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty((v) => !v)}
          className={cn('w-full border-t px-4 py-2 text-left text-xs font-medium', tone.rule, tone.ink)}
        >
          {showEmpty ? 'Hide empty' : `Show ${empty} empty`}
        </button>
      ) : null}
    </section>
  )
}
