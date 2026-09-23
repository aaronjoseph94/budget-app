import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isoDate, monthBounds, monthSheet, shiftMonth, type PeriodBlock, type PeriodSheet } from '@budget/core'
import { useAppData } from '../app-data.js'
import {
  countPendingBetween,
  getMonthBalance,
  latestStatementEnd,
  listBudgetHistory,
  listPlanHistory,
  listTransactions,
  type BudgetRow,
  type LedgerRow,
  type PlanRow,
} from '../ledger.js'
import { LIST_HEADING } from '../lists.js'
import { navigate } from '../nav.js'
import { budgetsForCore, categoriesForCore, entriesForCore, plansForCore } from '../sheet-input.js'
import { formatAmount, formatCents, formatIsoDate, formatMagnitude, formatMonthTitle, todayIso } from '../format.js'
import { Alert } from '../components/ui/feedback.js'
import { Button } from '../components/ui/button.js'
import { Icon } from '../components/ui/icons.js'
import { Figure, MonthTitle } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { BudgetEditor } from './BudgetEditor.js'
import { MonthCharges } from './MonthCharges.js'
import { MonthCharts } from './MonthCharts.js'
import { MonthSummary } from './MonthSummary.js'

/**
 * One Workbook month tab (plan §6.2, §6.3). `month` is the address's `YYYY-MM`,
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
  const { supabase, categories, pendingTotal, loadError, version } = useAppData()
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
  // Categories with their own "just this month" value in this month, which a
  // "from this month on" edit here must replace too (setBudget).
  const ownOnly = new Set(
    (here === null ? [] : here.budgets).filter((b) => b.applies === 'only' && b.month === start).map((b) => b.category_id),
  )
  const blockProps = {
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
          <p className="text-sm">Start in Setup: Workbook's lists, when you are paid, and your bills.</p>
          <Button className="mt-3" size="sm" onClick={() => navigate('setup')}>
            Open Setup
          </Button>
        </section>
      ) : null}

      {here !== null ? <ReviewBanner month={start} pendingHere={here.pendingHere} pendingTotal={pendingTotal} /> : null}

      {sheet !== null && typeof sheet !== 'string' ? (
        <>
          <p className="text-sm text-muted-foreground">
            {sheet.importedThrough === null
              ? 'No statement imported yet.'
              : `Statement imported up to ${formatIsoDate(sheet.importedThrough)}`}
          </p>
          {/* Phones: the block every statement changes first, and the charts
            last (§6.2). Four columns on a desktop in Workbook's own arrangement,
            Jan!B3:V44 (§6.3), the charts second on the top row as Workbook's
            panel H3:K18 is, from 1280px: below that a card is too narrow for
            three columns of amounts, and two columns hold them. The page is
            in phone order, which is the order a screen reader follows. */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MonthSummary sheet={sheet} month={start} onUnsaved={setStartUnsaved} />
            <Block kind="variable" block={sheet.blocks.variable} {...blockProps} className="order-1 xl:order-7" />
            <Block kind="bill" block={sheet.blocks.bill} {...blockProps} className="order-2 xl:order-4" />
            <Block kind="subscription" block={sheet.blocks.subscription} {...blockProps} className="order-3 xl:order-6" />
            <Block kind="debt" block={sheet.blocks.debt} {...blockProps} className="order-4 xl:order-5" />
            <Block kind="income" block={sheet.blocks.income} {...blockProps} className="order-5 xl:order-2" />
            <Block kind="savings" block={sheet.blocks.savings} {...blockProps} className="order-6 xl:order-3" />
            <MonthCharts sheet={sheet} className="order-7 md:col-span-2 xl:order-1 xl:col-span-1" />
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
        basis={row.basis}
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

export type BlockKind = keyof PeriodSheet['blocks']
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
 * The columns on each list. Workbook's Variable expenses have Budgeted, Actual
 * and Remaining (Jan!R20:V20, "Left" here to fit a phone); its Bills, Debts
 * and Subscriptions have Budgeted and Actual only, and the app adds a Left
 * (F16). Goal, Actual and Difference on Savings (R8:V8), Goal and Actual on
 * Income (M8:P8), as Workbook has.
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
 * per category on the list with Workbook's columns. A row with no budget and
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
  onOpen,
  onEditStart,
  editor,
  className,
}: {
  kind: BlockKind
  block: PeriodBlock
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
  const tone = TONE[kind]
  const columns = COLUMNS[kind]
  const word = columns.budget === 'Goal' ? 'Goal' : 'Budget'
  const heading = LIST_HEADING[kind]
  const isEmpty = (r: Row) => r.basis === 'none' && r.budgetCents === null
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
        // a desktop the four cards take Workbook's smaller table type.
        <div className="overflow-x-auto">
          <table className="w-full text-sm xl:text-xs">
            <thead className={cn(tone.header, tone.ink)}>
              <tr>
                <th scope="col" className="py-1.5 pl-4 pr-1 text-left text-xs font-medium">
                  Category
                </th>
                {[columns.budget, 'Actual', ...(columns.third === null ? [] : [columns.third])].map((name) => (
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
                        className="break-words rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
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
                        aria-label={`${word} for ${r.name}, ${r.budgetCents === null ? 'none set' : formatCents(r.budgetCents)}`}
                        aria-expanded={editing === r.categoryId}
                        onClick={(e) => {
                          e.stopPropagation()
                          setNote(null)
                          onEditStart?.()
                          setEditing(r.categoryId)
                        }}
                        className="rounded-sm underline decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {r.budgetCents === null ? (
                          <Icon name="pencil" className="inline size-3.5 opacity-60" />
                        ) : (
                          formatAmount(r.budgetCents)
                        )}
                      </button>
                    )}
                  </td>
                  {/* A zero on a budgeted row stays blank, as Workbook's ";;" format
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
                  {columns.third === null ? null : (
                    <td className="tnum whitespace-nowrap py-2 pl-1 pr-4 text-right">
                      <Third row={r} column={columns.third} empty={isEmpty(r)} />
                    </td>
                  )}
                </tr>,
                // The budget is typed in a row of its own, under the one tapped.
                editor !== undefined && editing === r.categoryId ? (
                  <tr key={`${r.categoryId} budget`} className={cn('border-t', tone.rule)}>
                    <td colSpan={columns.third === null ? 3 : 4} className="px-4 py-3">
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
          className={cn('w-full border-t px-4 py-2 text-left text-xs font-medium', tone.rule, tone.ink)}
        >
          {showEmpty ? 'Hide empty' : `Show ${empty} empty`}
        </button>
      ) : null}
    </section>
  )
}

/**
 * A row's Left (Budget − Actual) or Difference (Actual − Goal), from core.
 * Overspent is Workbook's pill (Jan!V22:V44, cream on red), in the darker red
 * that makes its text readable, with the minus sign Workbook's format hid (D8).
 * A fund short of its goal keeps its minus sign without the pill, as Workbook
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
