import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  historyStart,
  isoDate,
  monthBounds,
  monthSheet,
  periodComparison,
  shiftMonth,
  type BlockChange,
  type RowChange,
  type PeriodBlock,
  type PeriodComparison,
  type PeriodSheet,
} from '@budget/core'
import { useAppData } from '../app-data.js'
import {
  countPendingBetween,
  getMonthBalance,
  latestStatementEnd,
  listBudgetHistory,
  listPlanHistory,
  listTransactions,
  readRecordsStart,
  type BudgetRow,
  type LedgerRow,
  type PlanRow,
} from '../ledger.js'
import { LIST_HEADING } from '../lists.js'
import { navigate } from '../nav.js'
import { PeriodSwitch } from './PeriodSwitch.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import {
  formatAmount,
  formatCents,
  formatChange,
  formatDateRange,
  formatIsoDate,
  formatMagnitude,
  formatMonthName,
  formatMonthTitle,
  todayIso,
} from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { useReturnFocus } from '../lib/return-focus.js'
import { BudgetEditor } from './BudgetEditor.js'
import { MonthCharges } from './MonthCharges.js'
import { MonthCharts } from './MonthCharts.js'
import { MonthSummary } from './MonthSummary.js'
import { HelpButton } from '../help/HelpButton.js'
import { ErrorBoundary } from '../components/ErrorBoundary.js'

// The coach line and the forecast line are their own chunks, fetched once the Month has drawn (D27).
const MonthCoachLine = lazy(() => import('./MonthCoachLine.js'))
const MonthForecastLine = lazy(() => import('./MonthForecastLine.js'))

/**
 * One of the workbook's month tabs (plan §6.2, §6.3). `month` is the address's `YYYY-MM`,
 * or null for this month; the arrows step through shiftMonth in packages/core
 * and write the month they land on into the address, so a refresh or the
 * back gesture returns to it.
 *
 * Every number is monthSheet's, from packages/core, over the whole month's
 * ledger, the budgets and monthly amounts typed up to it and the starting
 * balance typed for it; this screen only formats them. Nothing unreviewed is
 * in it.
 */
export function MonthScreen({ month }: { month: string | null }) {
  const { supabase, categories, pendingTotal, loadError, status, version } = useAppData()
  const { start, end } = monthBounds(isoDate(month === null ? todayIso() : `${month}-01`))
  const step = (months: number) => navigate('month', shiftMonth(start, months).slice(0, 7))
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The category whose charges are open, by id; a new month closes it.
  const [opened, setOpened] = useState<string | null>(null)
  useEffect(() => setOpened(null), [start])
  // A budget refused after its editor closed, which it can no longer show;
  // kept, across months too, until another editor opens.
  const [unsaved, setUnsaved] = useState<string | null>(null)
  // The starting balance's, kept the same way until its editor opens again.
  const [startUnsaved, setStartUnsaved] = useState<string | null>(null)

  useEffect(() => {
    // Nothing is read before the app's first load (version 0) brings the
    // categories: rows read sooner name categories core has not been given,
    // and it refuses them, so a slow first load showed "did not load" (N35).
    if (version === 0) return
    let live = true
    setError(null)
    Promise.all([
      listTransactions(supabase, { from: start, to: end }),
      listBudgetHistory(supabase, start),
      listPlanHistory(supabase, start, 'month'),
      latestStatementEnd(supabase),
      countPendingBetween(supabase, { from: start, to: end }),
      getMonthBalance(supabase, start),
    ])
      .then(
        ([rows, budgets, plans, ends, pendingHere, balance]) =>
          live && setLoaded({ start, rows, budgets, plans, ends, pendingHere, balance }),
      )
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Could not load this month.'))
    return () => {
      live = false
    }
  }, [supabase, start, end, version])

  // Last month's rows and where the records start, for the comparison
  // (F24, F25). Read beside the month rather than inside its read, so a
  // failure here costs the comparison alone and the month still shows.
  const [earlier, setEarlier] = useState<Earlier | null>(null)
  useEffect(() => {
    if (version === 0) return
    let live = true
    const last = monthBounds(shiftMonth(start, -1))
    Promise.all([listTransactions(supabase, { from: last.start, to: last.end }), readRecordsStart(supabase)])
      .then(([rows, records]) => live && setEarlier({ start, rows, ...records }))
      .catch(() => live && setEarlier({ start, failed: true }))
    return () => {
      live = false
    }
  }, [supabase, start, version])

  // A month's rows only ever fill that month: while the next one loads, the
  // screen waits rather than show last month's charges under this title.
  const here = loaded !== null && loaded.start === start ? loaded : null
  const sheet = useMemo((): PeriodSheet | string | null => {
    if (here === null) return null
    try {
      return monthSheet({
        asOf: start,
        categories: categoriesForCore(categories),
        // Everything typed up to this month; core picks what is in effect.
        budgetHistory: budgetsForCore(here.budgets),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore(here.rows),
        statementPeriodEnds: here.ends.map((e) => isoDate(e)),
        // This month's alone, or none: never last month's, and never $0 (D17).
        startingBalanceCents: here.balance,
      })
    } catch {
      // The engine refuses a charge, a budget or a monthly amount whose
      // category it was not given rather than leave it out of every total.
      // Said plainly, never as its message.
      return 'A charge, a budget or a monthly amount this month names a category that did not load, so the month is not shown. Reload to try again.'
    }
  }, [here, categories, start])
  // Null while either read is out; 'failed' hides the comparison with one line.
  const comparison = useMemo((): PeriodComparison | 'failed' | null => {
    const before = earlier !== null && earlier.start === start ? earlier : null
    if (here === null || before === null) return null
    if ('failed' in before) return 'failed'
    try {
      return periodComparison({
        period: 'month',
        month: start,
        asOf: isoDate(todayIso()),
        historyStart: historyStart({
          statementPeriodStarts: before.statementStarts.map((d) => isoDate(d)),
          entryDates: before.entryDates.map((d) => isoDate(d)),
        }).start,
        categories: categoriesForCore(categories),
        planHistory: plansForCore(here.plans),
        entries: entriesForCore([...here.rows, ...before.rows]),
      })
    } catch {
      // As the month's own sheet: a row naming a category that did not load.
      return 'failed'
    }
  }, [here, earlier, categories, start])
  // Left, or the change against the same days last month, in every block's
  // third column: one choice for the whole Month, kept on this device.
  const [third, setThird] = useState<ThirdColumn>(readThird)
  const chooseThird = (next: ThirdColumn) => {
    setThird(next)
    writeThird(next)
  }
  const compared = comparison !== null && comparison !== 'failed' && comparison.status === 'compared' ? comparison : null
  // The coach line speaks of today, so only on this month, and only from
  // the two months already read: never a read of its own (D27).
  const today = todayIso()
  const lastMonth = earlier !== null && earlier.start === start && !('failed' in earlier) ? earlier : null
  const coachRead = useMemo(
    () =>
      here === null || lastMonth === null || monthBounds(isoDate(today)).start !== start
        ? null
        : {
            asOf: today,
            readFrom: shiftMonth(start, -1),
            rows: [...here.rows, ...lastMonth.rows],
            budgets: here.budgets,
            plans: here.plans,
            statementEnds: here.ends,
            records: { statementStarts: lastMonth.statementStarts, entryDates: lastMonth.entryDates },
            pending: status === 'ready' ? pendingTotal : null,
          },
    [here, lastMonth, start, today, status, pendingTotal],
  )
  const vsLabel =
    compared === null
      ? null
      : `vs ${compared.sameDays ? formatDateRange(compared.before.from, compared.before.to) : formatMonthName(compared.before.from)}`
  // Categories with their own "just this month" value in this month, which a
  // "from this month on" edit here must replace too (setBudget).
  const ownOnly = new Set(
    (here === null ? [] : here.budgets).filter((b) => b.applies === 'only' && b.month === start).map((b) => b.category_id),
  )
  const blockProps = {
    compare:
      compared === null || vsLabel === null || third === 'left' ? undefined : { label: vsLabel, blocks: compared.blocks },
    chips: compared === null ? undefined : compared.blocks,
    onOpen: setOpened,
    onEditStart: () => setUnsaved(null),
    editor: (row: Row, word: BudgetWord, done: EditorDone) => (
      <BudgetEditor
        row={row}
        word={word}
        month={start}
        replacesOnly={ownOnly.has(row.categoryId)}
        onCancel={done.cancel}
        onSaved={done.saved}
        onFailedAfterClose={setUnsaved}
      />
    ),
  }

  return (
    <div className="space-y-4">
      <PeriodSwitch current="month" />
      <header className="-mx-4 flex flex-wrap items-center justify-between gap-2 bg-title-band px-4 py-4 md:mx-0 md:rounded-xl">
        <MonthTitle>{formatMonthTitle(start)}</MonthTitle>
        {/* The ? sits with the header's buttons, as in the plan's sketch: beside
          the title it broke "September 2026" onto two lines at 320px. With the
          phone's text at 200% the four no longer fit one row, so they wrap. */}
        <div className="flex flex-wrap items-center gap-1">
          {/* The Bill calendar left the wide bar for More (ADR 0006); from the Month it is one tap, at this month. */}
          <Button variant="outline" size="icon" aria-label="Bill calendar" onClick={() => navigate('calendar', start.slice(0, 7))}>
            <Icon name="bills" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => step(-1)}>
            <Icon name="chevronLeft" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => step(1)}>
            <Icon name="chevronRight" />
          </Button>
          <HelpButton screen="month" />
        </div>
      </header>

      {error !== null ? (
        <Alert tone="error" title="Could not load this month">
          {error}
        </Alert>
      ) : null}
      {unsaved !== null ? (
        <Alert tone="error" title="A budget or goal was not saved">
          {unsaved}
        </Alert>
      ) : null}
      {startUnsaved !== null ? (
        <Alert tone="error" title="The starting balance was not saved">
          {startUnsaved}
        </Alert>
      ) : null}
      {typeof sheet === 'string' ? (
        <Alert tone="error" title="Could not show this month">
          {sheet}
        </Alert>
      ) : null}
      {/* A first load that failed is said above the screen, by App, and this
        screen reads nothing without it. A later reload that failed leaves
        the categories in place, so a month still loads, and says so. */}
      {sheet === null && error === null && (version > 0 || loadError === null) ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : null}

      {/* A first run: six empty blocks each saying "Add one in Setup" left
        the first step unsaid, so it is said once, here. */}
      {version > 0 && categories.length === 0 ? (
        <section aria-label="Start here" className="rounded-xl border bg-card p-4 shadow-sm">
          <p className="text-sm">
            New here? Getting started sets up your lists, pay, bills and goals one step at a time, a few minutes each.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate('start')}>
              Get started
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate('setup')}>
              Open Setup
            </Button>
          </div>
        </section>
      ) : null}

      {here !== null ? <ReviewBanner month={start} pendingHere={here.pendingHere} pendingTotal={pendingTotal} /> : null}

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          {coachRead === null ? null : (
            <ErrorBoundary key={start}>
              <Suspense fallback={null}>
                <MonthCoachLine read={coachRead} categories={categories} />
              </Suspense>
            </ErrorBoundary>
          )}
          <ImportedThrough through={sheet.importedThrough} />
          {/* Phones: the block every statement changes first, and the charts
            last (§6.2). Four columns on a desktop in the workbook's own arrangement,
            Jan!B3:V44 (§6.3), the charts second on the top row as the workbook's
            panel H3:K18 is, from 1280px: below that a card is too narrow for
            three columns of amounts, and two columns hold them. The page is
            in phone order, which is the order a screen reader follows. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MonthSummary
              sheet={sheet}
              month={start}
              comparison={comparison}
              // This month only, and only with a start typed: no balance without one (D17).
              forecast={
                coachRead === null || sheet.summary.startingBalanceCents === null ? null : (
                  <ErrorBoundary key={start}>
                    <Suspense fallback={null}>
                      <MonthForecastLine />
                    </Suspense>
                  </ErrorBoundary>
                )
              }
              onUnsaved={setStartUnsaved}
            />
            {vsLabel === null ? null : <ThirdSwitch third={third} vsLabel={vsLabel} onChange={chooseThird} />}
            <PeriodBlocks blocks={sheet.blocks} {...blockProps} />
            <MonthCharts sheet={sheet} className="order-7 md:col-span-2 xl:order-1 xl:col-span-1" />
          </div>
          <TransfersNote cents={sheet.transfersCents} />
          {here !== null && opened !== null ? (
            <OpenedRow
              sheet={sheet}
              rows={here.rows}
              categoryId={opened}
              month={start}
              compared={compared}
              onClose={() => setOpened(null)}
            />
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
  compared,
  onClose,
}: {
  sheet: PeriodSheet
  rows: readonly LedgerRow[]
  categoryId: string
  month: string
  compared: Extract<PeriodComparison, { status: 'compared' }> | null
  onClose: () => void
}) {
  const { mainGoal } = useAppData()
  for (const kind of BLOCKS) {
    const row = sheet.blocks[kind].rows.find((r) => r.categoryId === categoryId)
    if (row === undefined) continue
    const before = compared?.blocks[kind].rows.find((r) => r.categoryId === categoryId)
    // A Variable charge in the main goal's time, when the goal has one (D29).
    const rate = kind === 'variable' && mainGoal !== null ? mainGoal.unit_cost_cents : null
    return (
      <MonthCharges
        categoryId={categoryId}
        name={row.name}
        heading={LIST_HEADING[kind]}
        month={month}
        actualCents={row.actualCents}
        basis={row.basis}
        charges={rows.filter((r) => r.category_id === categoryId)}
        lastMonth={
          compared === null || before === undefined
            ? null
            : { label: compared.sameDays ? 'Last month (same days)' : 'Last month', cents: before.beforeCents }
        }
        toward={rate === null || mainGoal === null ? null : { goalName: mainGoal.name, unitCostCents: rate }}
        onClose={onClose}
      />
    )
  }
  return null
}

interface Loaded {
  readonly start: string
  readonly rows: readonly LedgerRow[]
  /** Every budget and goal typed for this month or before it. */
  readonly budgets: readonly BudgetRow[]
  /** Every monthly amount typed from this month or before it. */
  readonly plans: readonly PlanRow[]
  readonly ends: readonly string[]
  /** Charges dated this month still waiting for review. */
  readonly pendingHere: number
  /** The starting balance typed for this month, or null when none was. */
  readonly balance: number | null
}

/** Last month's ledger and where the records start, or that they did not load. */
type Earlier =
  | {
      readonly start: string
      /** The whole of last month; core keeps the days it compares. */
      readonly rows: readonly LedgerRow[]
      readonly statementStarts: readonly string[]
      readonly entryDates: readonly string[]
    }
  | { readonly start: string; readonly failed: true }

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
              Not filed yet: {pendingHere} from {formatMonthName(month)} waiting for review
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

export type BlockKind = keyof PeriodSheet['blocks']
const BLOCKS: readonly BlockKind[] = ['variable', 'bill', 'subscription', 'debt', 'income', 'savings']

/** The workbook's colours per block (§6.6): Bills, Debts and Subscriptions share one set. Written out for Tailwind. */
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
 * The columns on each list. The workbook's Variable expenses have Budgeted, Actual
 * and Remaining (Jan!R20:V20, "Left" here to fit a phone); its Bills, Debts
 * and Subscriptions have Budgeted and Actual only, and the app adds a Left
 * (F16). Goal, Actual and Difference on Savings (R8:V8), Goal and Actual on
 * Income (M8:P8), as the workbook has.
 */
const COLUMNS: Record<BlockKind, { readonly budget: 'Budgeted' | 'Goal'; readonly third: 'Left' | 'Difference' | null }> = {
  income: { budget: 'Goal', third: null },
  savings: { budget: 'Goal', third: 'Difference' },
  bill: { budget: 'Budgeted', third: 'Left' },
  debt: { budget: 'Budgeted', third: 'Left' },
  subscription: { budget: 'Budgeted', third: 'Left' },
  variable: { budget: 'Budgeted', third: 'Left' },
}

type Row = PeriodBlock['rows'][number]
type BudgetWord = 'Budget' | 'Goal'
/** How a budget editor under a row ends: closed unsaved, or saved with a note to show. */
export interface EditorDone {
  readonly cancel: () => void
  readonly saved: (note: string) => void
}

/**
 * One block: its heading and "$Actual of $Budget" on the band, then a row
 * per category on the list with the workbook's columns. A row with no budget and
 * nothing in the period folds behind "Show N empty". Cells leave out the "$",
 * as the plan's phone sketch does (§6.2): with it, three columns of amounts
 * do not fit a 360px phone or a desktop card.
 *
 * The Month, the Week and Paycheck draw their blocks here. Each says what a
 * tap on a row opens, if anything, and which editor types a budget, since a
 * month's budgets and a week's are stored apart. Paycheck has none: its
 * budgets are the month's, shared across the period (F15), and typed there.
 */
export function Block({
  kind,
  block,
  compare,
  chips,
  onOpen,
  onEditStart,
  editor,
  className,
}: {
  kind: BlockKind
  block: PeriodBlock
  /** Given, the third column is each row's change against the earlier window, headed with `label` (D26). */
  compare?: { readonly label: string; readonly blocks: Readonly<Record<BlockKind, BlockChange>> } | undefined
  /** Given, the band shows the block's total change beside its total. */
  chips?: Readonly<Record<BlockKind, BlockChange>> | undefined
  /** Opens a row's charges; without it a row is not a button. */
  onOpen?: (categoryId: string) => void
  /** Called as a budget editor opens, to clear what an earlier one left. */
  onEditStart?: () => void
  /** The form that types a row's budget, in a row of its own under it; without it a budget is only shown. */
  editor?: (row: Row, word: BudgetWord, done: EditorDone) => ReactNode
  className: string
}) {
  const [showEmpty, setShowEmpty] = useState(false)
  // The row whose budget is being typed, and what the last save did.
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const openers = useRef(new Map<string, HTMLButtonElement>())
  useReturnFocus(editing, (id) => openers.current.get(id))
  const tone = TONE[kind]
  const columns = COLUMNS[kind]
  const word = columns.budget === 'Goal' ? 'Goal' : 'Budget'
  const heading = LIST_HEADING[kind]
  const changes = compare === undefined ? null : new Map(compare.blocks[kind].rows.map((c) => [c.categoryId, c]))
  const third = changes === null ? columns.third : 'vs'
  // Beside last month, a row with nothing now but something then is not empty.
  const isEmpty = (r: Row) =>
    r.basis === 'none' && r.budgetCents === null && (changes === null || changes.get(r.categoryId)?.beforeCents === 0)
  const total = chips?.[kind].total
  const empty = block.rows.filter(isEmpty).length
  const shown = showEmpty ? block.rows : block.rows.filter((r) => !isEmpty(r))
  // "of $0.00" would read as a budget of nothing, so the band names a budget
  // total only once a budget or goal is set on the list.
  const budgeted = block.rows.some((r) => r.budgetCents !== null)

  return (
    <section
      aria-label={heading}
      className={cn('overflow-hidden rounded-xl border bg-card shadow-sm', tone.rule, className)}
    >
      <div className={cn('flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-3', tone.band, tone.ink)}>
        <h2 className="text-sm font-semibold uppercase tracking-wide">{heading}</h2>
        <p>
          <Figure className="text-lg font-bold">{formatCents(block.actualTotalCents)}</Figure>
          {budgeted ? <span className="tnum text-sm"> of {formatCents(block.budgetTotalCents)}</span> : null}
          {/* Under $1 is the same (F26), and a chip saying so on every quiet list is noise. */}
          {/* Kept whole where it fits; with the phone's text at 200% it was
            wider than the card and pushed the Month sideways (N58). */}
          {total === undefined || total.direction === 'same' ? null : (
            <span className="ml-2 inline-block max-w-full rounded-full bg-card/70 px-2 py-0.5 text-xs font-medium">
              <span aria-hidden="true">{total.direction === 'more' ? '▲ ' : '▼ '}</span>
              {formatChange(total)}
              <span className="sr-only"> than last month</span>
            </span>
          )}
        </p>
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
        // A table wider than its card scrolls rather than clip a column. On
        // a desktop the four cards take the workbook's smaller table type.
        <div className="overflow-x-auto">
          <table className="w-full text-sm xl:text-xs">
            <thead className={cn(tone.header, tone.ink)}>
              <tr>
                <th scope="col" className="py-1.5 pl-4 pr-1 text-left text-xs font-medium">
                  Category
                </th>
                {[columns.budget, 'Actual', ...(third === null ? [] : [third === 'vs' && compare !== undefined ? compare.label : third])].map((name) => (
                  <th key={name} scope="col" className="px-1 py-1.5 text-right text-xs font-medium last:pr-4">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.flatMap((r) => [
                // The whole row takes a tap; the button in it is what a keyboard
                // or a screen reader reaches, named by the category.
                <tr
                  key={r.categoryId}
                  onClick={onOpen === undefined ? undefined : () => onOpen(r.categoryId)}
                  className={cn('border-t', onOpen !== undefined && 'cursor-pointer hover:bg-accent/60', tone.rule)}
                >
                  <th scope="row" className="py-2 pl-4 pr-1 text-left font-normal [overflow-wrap:anywhere]">
                    {onOpen === undefined ? (
                      r.name
                    ) : (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpen(r.categoryId)
                        }}
                        className="break-words rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-2 pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:w-full pointer-coarse:items-center"
                      >
                        {r.name}
                      </button>
                    )}
                  </th>
                  {/* Its own tap: the budget is typed here, in the row, and the
                    charges do not open. A pencil where none is set yet. */}
                  <td className="tnum whitespace-nowrap px-1 py-2 text-right">
                    {editor === undefined ? (
                      r.budgetCents === null ? '' : formatAmount(r.budgetCents)
                    ) : (
                      <button
                        type="button"
                        ref={(el) => {
                          if (el === null) openers.current.delete(r.categoryId)
                          else openers.current.set(r.categoryId, el)
                        }}
                        aria-label={`${word} for ${r.name}, ${r.budgetCents === null ? 'none set' : formatCents(r.budgetCents)}`}
                        aria-expanded={editing === r.categoryId}
                        onClick={(e) => {
                          e.stopPropagation()
                          setNote(null)
                          onEditStart?.()
                          setEditing(r.categoryId)
                        }}
                        // A finger gets the whole cell, 44px tall, not the
                        // 14px pencil or the amount's own width (FE-1).
                        className="rounded-sm underline decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:-my-2 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:w-full pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-end"
                      >
                        {r.budgetCents === null ? (
                          <Icon name="pencil" className="inline size-3.5 opacity-60" />
                        ) : (
                          formatAmount(r.budgetCents)
                        )}
                      </button>
                    )}
                  </td>
                  {/* A zero on a budgeted row stays blank, as the workbook's ";;" format
                    leaves it. "planned" follows its amount, as in the plan's
                    §6.2 sketch, but on a line of its own: on the same line the
                    word widened the column past a four-across desktop card,
                    and Left was cut off. */}
                  <td
                    className={cn(
                      'tnum whitespace-nowrap px-1 py-2 text-right last:pr-4',
                      r.actualCents < 0 && 'text-spend',
                    )}
                  >
                    {r.basis === 'none' ? '' : formatAmount(r.actualCents)}
                    {r.basis === 'planned' ? (
                      <span className="block text-xs leading-none text-muted-foreground xl:text-[0.625rem]">planned</span>
                    ) : null}
                  </td>
                  {third === null ? null : (
                    <td className="tnum whitespace-nowrap py-2 pl-1 pr-4 text-right">
                      {third === 'vs' ? (
                        <VsCell change={changes?.get(r.categoryId)} empty={isEmpty(r)} />
                      ) : (
                        <Third row={r} column={third} empty={isEmpty(r)} />
                      )}
                    </td>
                  )}
                </tr>,
                // The budget is typed in a row of its own, under the one tapped.
                editor !== undefined && editing === r.categoryId ? (
                  <tr key={`${r.categoryId} budget`} className={cn('border-t', tone.rule)}>
                    <td colSpan={third === null ? 3 : 4} className="px-4 py-3">
                      {editor(r, word, {
                        cancel: () => setEditing(null),
                        saved: (saved) => {
                          // Only its own editor: another row may have been
                          // opened while this one was saving.
                          setEditing((now) => (now === r.categoryId ? null : now))
                          setNote(saved)
                        },
                      })}
                    </td>
                  </tr>
                ) : null,
              ])}
            </tbody>
          </table>
        </div>
      )}
      {note !== null ? (
        <p role="status" className={cn('border-t px-4 py-2 text-xs', tone.rule, tone.ink)}>
          {note}
        </p>
      ) : null}
      {empty > 0 ? (
        <button
          type="button"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty((v) => !v)}
          className={cn('w-full border-t px-4 py-2 text-left text-xs font-medium pointer-coarse:min-h-11', tone.rule, tone.ink)}
        >
          {showEmpty ? 'Hide empty' : `Show ${empty} empty`}
        </button>
      ) : null}
    </section>
  )
}

/**
 * The six blocks in the workbook's order, as the Month, the Week and Paycheck all
 * lay them out: phone order first, which a screen reader follows, and
 * the workbook's four-across arrangement from 1280px (CR-2: each had its own copy).
 */
export function PeriodBlocks({
  blocks,
  ...blockProps
}: { blocks: PeriodSheet['blocks'] } & Omit<Parameters<typeof Block>[0], 'kind' | 'block' | 'className'>) {
  return (
    <>
      <Block kind="variable" block={blocks.variable} {...blockProps} className="order-1 xl:order-7" />
      <Block kind="bill" block={blocks.bill} {...blockProps} className="order-2 xl:order-4" />
      <Block kind="subscription" block={blocks.subscription} {...blockProps} className="order-3 xl:order-6" />
      <Block kind="debt" block={blocks.debt} {...blockProps} className="order-4 xl:order-5" />
      <Block kind="income" block={blocks.income} {...blockProps} className="order-5 xl:order-2" />
      <Block kind="savings" block={blocks.savings} {...blockProps} className="order-6 xl:order-3" />
    </>
  )
}

/** Where the statements end, above a period's blocks. */
export function ImportedThrough({ through }: { through: string | null }) {
  return (
    <p className="text-sm text-muted-foreground">
      {through === null ? 'No statement imported yet.' : `Statement imported up to ${formatIsoDate(through)}`}
    </p>
  )
}

/** Left out of every block and total above, so said out loud (D9). Nothing when there is none. */
export function TransfersNote({ cents }: { cents: number }) {
  if (cents === 0) return null
  return (
    <p className="text-sm text-muted-foreground">
      {cents > 0 ? 'Paid to your card: ' : 'Moved out, not spending: '}
      <span className="tnum">{formatMagnitude(cents)}</span> — not counted.
      {cents > 0 ? ' What it paid for is already in the blocks above.' : ''}
    </p>
  )
}

/**
 * A row's Left (Budget − Actual) or Difference (Actual − Goal), from core.
 * Overspent is the workbook's pill (Jan!V22:V44, cream on red), in the darker red
 * that makes its text readable, with the minus sign the workbook's format hid (D8).
 * A fund short of its goal keeps its minus sign without the pill, as the workbook
 * marks only spending. Blank where core gives none, and on an empty row.
 */
function Third({ row, column, empty }: { row: Row; column: 'Left' | 'Difference'; empty: boolean }) {
  const value = column === 'Left' ? row.remainingCents : row.differenceCents
  if (value === null || empty) return null
  if (column === 'Left' && value < 0) {
    return <span className="rounded-full bg-spend px-1.5 py-0.5 text-spend-foreground">{formatAmount(value)}</span>
  }
  return <>{formatAmount(value)}</>
}

/**
 * A row's change against the same days last month, from periodComparison:
 * signed, with its word for a screen reader, "same" under $1 (F26). The
 * heading names the window, so the cell stays as narrow as Left.
 */
function VsCell({ change, empty }: { change: RowChange | undefined; empty: boolean }) {
  if (change === undefined || empty) return null
  if (change.direction === 'same') return <span className="text-muted-foreground">same</span>
  return (
    <>
      {change.direction === 'more' ? '+' : ''}
      {formatAmount(change.changeCents)}
      <span className="sr-only"> {change.direction}</span>
    </>
  )
}

type ThirdColumn = 'left' | 'vs'
const THIRD_KEY = 'budget.month.third'

/** This device's choice; Left when none was made or storage cannot be read. */
function readThird(): ThirdColumn {
  try {
    return window.localStorage.getItem(THIRD_KEY) === 'vs' ? 'vs' : 'left'
  } catch {
    return 'left'
  }
}

function writeThird(next: ThirdColumn): void {
  try {
    window.localStorage.setItem(THIRD_KEY, next)
  } catch {
    // Storage blocked: the choice holds until the page is closed.
  }
}

/**
 * One switch for every block's third column, Left or the change against the
 * earlier window. It replaces Left rather than adding a column, so a phone
 * never has four (plan §9).
 */
function ThirdSwitch({
  third,
  vsLabel,
  onChange,
}: {
  third: ThirdColumn
  vsLabel: string
  onChange: (next: ThirdColumn) => void
}) {
  const options: readonly { readonly key: ThirdColumn; readonly label: string }[] = [
    { key: 'left', label: 'Left' },
    { key: 'vs', label: vsLabel },
  ]
  return (
    <div
      role="group"
      aria-label="Last column"
      className="order-0 flex flex-wrap items-center gap-1.5 md:col-span-2 xl:col-span-4"
    >
      <span className="mr-1 text-xs font-medium text-muted-foreground">Last column</span>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={third === o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-xs font-medium pointer-coarse:min-h-11',
            third === o.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-card',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
