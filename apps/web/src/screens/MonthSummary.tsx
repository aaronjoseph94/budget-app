import { useRef, useState, type ReactNode } from 'react'
import type { PeriodComparison, PeriodSheet } from '@budget/core'
import { formatBasisPoints, formatCents, formatChange, formatDayMonth, formatMonthName } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { useReturnFocus } from '../lib/return-focus.js'
import { StartEditor } from './StartEditor.js'

/**
 * The workbook's summary card, Jan!B5:F16: Start, Spent, Left to spend and End of
 * month (D9, D11, D13, D15), each of them core's. The workbook's labels were
 * pictures that did not survive the export, so these name what its formulas
 * and its D9 note ("Type in the Bank Balance you started the month with!")
 * say each number is, in the workbook's order, two to a row as in the plan's sketch.
 *
 * Start is the balance typed for this month (decision 6), and is typed by
 * tapping it. With none typed the card asks for it where the number would
 * be, and End of month, which core gives only from a typed start (D17), says
 * what it waits for. A save refused after its editor closed goes to
 * `onUnsaved`, which is cleared when the editor opens again.
 *
 * A negative Left to spend takes the workbook's pink (Jan!D13:E14's conditional
 * format) in an ink that can be read on it. The workbook marks nothing else on the
 * card, so a negative End of month keeps the card's colour and shows its
 * minus sign (D8).
 *
 * Under the four, last month beside this one (D26): both same-days figures,
 * both dates and the change, every one of them periodComparison's. Never a
 * change under Spent: a same-days window counts a planned bill only on its
 * due day (F8), and Spent counts it all month (F25).
 */
export function MonthSummary({
  sheet,
  month,
  comparison,
  forecast = null,
  onUnsaved,
}: {
  sheet: PeriodSheet
  /** The month's first day. */
  month: string
  /** Null while it loads; 'failed' when last month could not be read. */
  comparison: PeriodComparison | 'failed' | null
  /** The labelled forecast line, loaded apart (D27); null where none is shown. */
  forecast?: ReactNode
  onUnsaved: (message: string | null) => void
}) {
  const { startingBalanceCents: start, spentCents, leftToSpendCents: left, endingBalanceCents: end } = sheet.summary
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  const [editing, setEditing] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  useReturnFocus(editing ? true : null, () => opener.current)
  const [note, setNote] = useState<string | null>(null)
  return (
    <section
      aria-label="Summary"
      className="order-0 rounded-xl border bg-summary p-4 shadow-sm md:col-span-2 xl:order-1 xl:col-span-1"
    >
      {/* One card of four on a desktop, beside the charts (§6.3): too narrow
        for two amounts side by side, so the four stack. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 xl:grid-cols-1">
        <Entry label="Start">
          <button
            type="button"
            ref={opener}
            aria-label={`Starting balance for ${formatMonthName(month)}, ${start === null ? 'none typed' : formatCents(start)}`}
            aria-expanded={editing}
            onClick={() => {
              setNote(null)
              onUnsaved(null)
              setEditing(true)
            }}
            className="rounded-sm text-left underline decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {start === null ? <Waiting>Type your starting bank balance</Waiting> : <Figure>{formatCents(start)}</Figure>}
          </button>
        </Entry>
        <Entry label="Spent">
          <Figure>{formatCents(spentCents)}</Figure>
        </Entry>
        <Entry
          label="Left to spend"
          // The workbook takes a blank budget as $0, so every dollar spent comes off
          // (F5). Only Variable expenses count here, so the hint names them.
          hint={noBudgets ? 'No budgets on Variable expenses yet.' : null}
        >
          <Figure
            className={cn(left < 0 && '-mx-1.5 rounded-lg bg-summary-negative px-1.5 text-summary-negative-ink')}
          >
            {formatCents(left)}
          </Figure>
        </Entry>
        <Entry label="End of month">
          {end === null ? <Waiting>Shown once Start is typed</Waiting> : <Figure>{formatCents(end)}</Figure>}
        </Entry>
      </dl>
      {forecast}
      <LastMonth comparison={comparison} />
      {editing ? (
        <StartEditor
          month={month}
          start={start}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            setNote(saved)
          }}
          onFailedAfterClose={onUnsaved}
        />
      ) : null}
      {note !== null ? (
        <p role="status" className="mt-3 text-xs text-summary-label">
          {note}
        </p>
      ) : null}
    </section>
  )
}

/** One of the card's four: its label, then its number, then any hint. */
function Entry({ label, hint = null, children }: { label: string; hint?: string | null; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-summary-label">{label}</dt>
      <dd className="text-2xl font-bold text-summary-value">{children}</dd>
      {hint === null ? null : <dd className="mt-0.5 text-xs text-summary-label">{hint}</dd>}
    </div>
  )
}

/** Words where a number will be, in the body face at body size so they never read as one. */
function Waiting({ children }: { children: ReactNode }) {
  return <span className="block pt-1 text-sm font-medium leading-snug">{children}</span>
}

/**
 * The comparison strip. A running month names its days ("By 24 Sep"), a month
 * already over names both months. With the earlier days before the records
 * (F24) it says what would make a comparison possible.
 */
function LastMonth({ comparison }: { comparison: PeriodComparison | 'failed' | null }) {
  if (comparison === null || (comparison !== 'failed' && comparison.status === 'not_started')) return null
  const line = (children: ReactNode) => (
    <div role="group" aria-label="Compared with last month" className="mt-3 border-t border-summary-label/30 pt-3 text-sm text-summary-value">
      {children}
    </div>
  )
  if (comparison === 'failed') {
    return line(<p className="text-summary-label">Last month did not load, so there is no comparison. Reload to try again.</p>)
  }
  const earlierMonth = formatMonthName(comparison.before.from)
  if (comparison.status === 'before_records') {
    return line(
      <p className="text-summary-label">
        {comparison.historyStart === null
          ? `Import a statement to compare with ${earlierMonth}.`
          : `Your records start on ${formatDayMonth(comparison.historyStart)}. Import the statement before that to compare with ${earlierMonth}.`}
      </p>,
    )
  }
  const { spent } = comparison.summary
  const [now, before] = comparison.sameDays
    ? [`By ${formatDayMonth(comparison.now.to)}`, `by ${formatDayMonth(comparison.before.to)}`]
    : [formatMonthName(comparison.now.from), formatMonthName(comparison.before.from)]
  return line(
    <>
      <p>
        {now}: <span className="tnum font-semibold">{formatCents(spent.nowCents)}</span> spent · {before}:{' '}
        <span className="tnum font-semibold">{formatCents(spent.beforeCents)}</span>
      </p>
      <p className="mt-0.5 font-medium">
        {spent.direction === 'same' ? (
          'About the same'
        ) : (
          <>
            <span aria-hidden="true">{spent.direction === 'more' ? '▲ ' : '▼ '}</span>
            {formatChange(spent)}
            {spent.changeBp === null ? '' : ` (${formatBasisPoints(Math.abs(spent.changeBp))})`}
          </>
        )}
      </p>
    </>,
  )
}
