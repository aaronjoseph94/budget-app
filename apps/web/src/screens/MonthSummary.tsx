import { useState, type ReactNode } from 'react'
import type { PeriodSheet } from '@budget/core'
import { formatCents, formatMonthTitle } from '../format.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { StartEditor } from './StartEditor.js'

/**
 * Workbook's summary card, Jan!B5:F16: Start, Spent, Left to spend and End of
 * month (D9, D11, D13, D15), each of them core's. Workbook's labels were
 * pictures that did not survive the export, so these name what its formulas
 * and its D9 note ("Type in the Bank Balance you started the month with!")
 * say each number is, in Workbook's order, two to a row as in the plan's sketch.
 *
 * Start is the balance typed for this month (decision 6), and is typed by
 * tapping it. With none typed the card asks for it where the number would
 * be, and End of month, which core gives only from a typed start (D17), says
 * what it waits for.
 *
 * A negative Left to spend takes Workbook's pink (Jan!D13:E14's conditional
 * format) in an ink that can be read on it. Workbook marks nothing else on the
 * card, so a negative End of month keeps the card's colour and shows its
 * minus sign (D8).
 */
export function MonthSummary({
  sheet,
  month,
}: {
  sheet: PeriodSheet
  /** The month's first day. */
  month: string
}) {
  const { startingBalanceCents: start, spentCents, leftToSpendCents: left, endingBalanceCents: end } = sheet.summary
  const noBudgets = sheet.blocks.variable.rows.every((r) => r.budgetCents === null)
  const [editing, setEditing] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  return (
    <section
      aria-label="Summary"
      className="order-0 rounded-xl border bg-summary p-4 shadow-sm md:col-span-2 xl:order-1"
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Entry label="Start">
          <button
            type="button"
            aria-label={`Starting balance for ${formatMonthTitle(month).split(' ')[0]}, ${start === null ? 'none typed' : formatCents(start)}`}
            aria-expanded={editing}
            onClick={() => {
              setNote(null)
              setEditing(true)
            }}
            className="rounded-sm text-left underline decoration-dotted underline-offset-4 outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"
          >
            {start === null ? <Waiting>Type your starting bank balance</Waiting> : <Figure>{formatCents(start)}</Figure>}
          </button>
        </Entry>
        <Entry label="Spent">
          <Figure>{formatCents(spentCents)}</Figure>
        </Entry>
        <Entry
          label="Left to spend"
          // Workbook takes a blank budget as $0, so every dollar spent comes off
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
      {editing ? (
        <StartEditor
          month={month}
          start={start}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false)
            setNote(saved)
          }}
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
