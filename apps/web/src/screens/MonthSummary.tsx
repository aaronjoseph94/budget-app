import { useRef, useState, type ReactNode } from 'react'
import type { PeriodComparison, PeriodSheet } from '@budget/core'
import { formatBasisPoints, formatCents, formatChange, formatDayMonth, formatMonthName } from '../format.js'
import { SavedNote } from '../components/ui/feedback.js'
import { Icon, type IconName } from '../components/ui/icons.js'
import { Figure } from '../components/ui/type.js'
import { cn } from '../lib/cn.js'
import { useReturnFocus } from '../lib/return-focus.js'
import { StartEditor } from './StartEditor.js'

/**
 * The workbook's summary card, Jan!B5:F16: Start, Spent, Left to spend and End of
 * month (D9, D11, D13, D15), each of them core's. The workbook's labels were
 * pictures that did not survive the export, so these name what its formulas
 * and its D9 note ("Type in the Bank Balance you started the month with!")
 * say each number is. Mockup A draws them as four stat cards, in design-review
 * P1 item 3's order: Left to spend, End of month, Start and Spent.
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
    <section aria-label="Summary" className="space-y-3">
      {/* Mockup A's four stat cards, in design-review P1 item 3's order: Left
        to spend first, as the one card with the accent's gradient, then End
        of month with the forecast under it, Start and Spent. Two across on
        a phone, one below 360 px, four from 1280 px. */}
      <dl className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 md:gap-4 xl:grid-cols-4">
        <StatCard
          label="Left to spend"
          icon="sparkles"
          hero
          // The workbook takes a blank budget as $0, so every dollar spent comes off
          // (F5). Only Variable expenses count here, so the hint names them.
          hint={noBudgets ? 'No budgets on Variable expenses yet.' : null}
        >
          <Figure
            className={cn(left < 0 && '-mx-1.5 rounded-lg bg-summary-negative px-1.5 text-summary-negative-ink')}
          >
            {formatCents(left)}
          </Figure>
        </StatCard>
        <StatCard label="End of month" icon="calendar" extra={forecast}>
          {end === null ? <Waiting>Shown once Start is typed</Waiting> : <Figure>{formatCents(end)}</Figure>}
        </StatCard>
        <StatCard label="Start" icon="wallet">
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
            className="rounded-sm text-left underline decoration-dotted decoration-2 underline-offset-[6px] outline-none hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
          >
            {start === null ? <Waiting>Type your starting bank balance</Waiting> : <Figure>{formatCents(start)}</Figure>}
          </button>
        </StatCard>
        <StatCard label="Spent" icon="bag">
          <Figure>{formatCents(spentCents)}</Figure>
        </StatCard>
      </dl>
      <LastMonth comparison={comparison} />
      {editing ? (
        <div className="rounded-xl border bg-card p-4">
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
        </div>
      ) : null}
      {note !== null ? <SavedNote className="text-xs text-muted-foreground">{note}</SavedNote> : null}
    </section>
  )
}

/**
 * One stat card: its label with an icon tile in the accent, then its
 * number, then any hint or line under it. Only the hero takes a gradient
 * (design-review P2 item 6); its words take `canvas-muted`, as #6b7280 reads
 * 4.27 to one on the accent's tint where the gradient ends (ADR 0010). The
 * tiles take the accent, never a list's hue, which names a list (ADR 0010).
 */
export function StatCard({
  label,
  icon,
  hero = false,
  hint = null,
  extra = null,
  children,
}: {
  label: string
  icon: IconName
  hero?: boolean
  hint?: string | null
  extra?: ReactNode
  children: ReactNode
}) {
  const quiet = hero ? 'text-canvas-muted' : 'text-muted-foreground'
  return (
    <div className={cn('min-w-0 rounded-xl border p-4 md:px-6 md:pt-5 md:pb-6', hero ? 'bg-linear-to-b from-card to-primary-tint' : 'bg-card')}>
      <dt className={cn('flex items-center justify-between gap-2 text-sm md:text-base', quiet)}>
        {label}
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon name={icon} className="size-[1.125rem]" />
        </span>
      </dt>
      <dd className="mt-1 text-2xl font-bold tracking-[-0.02em] text-foreground xl:text-[2rem]">{children}</dd>
      {hint === null ? null : <dd className={cn('mt-1 text-sm', quiet)}>{hint}</dd>}
      {extra === null ? null : <dd>{extra}</dd>}
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
    <div role="group" aria-label="Compared with last month" className="rounded-xl border bg-card px-4 py-3 text-sm text-summary-value md:px-6">
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
