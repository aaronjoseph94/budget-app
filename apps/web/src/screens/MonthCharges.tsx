import type { LedgerRow } from '../ledger.js'
import { formatCents, formatIsoDate, formatMonthTitle } from '../format.js'
import { IngestedText } from '../ui.js'
import { Sheet } from '../components/ui/sheet.js'
import { cn } from '../lib/cn.js'

/**
 * One Month row opened: the charges filed under that category in the month
 * (plan §6.2). The Actual is the engine's, passed in from monthSheet; the
 * charges are the month's ledger rows for the category, newest first, shown
 * as they are and never added up here.
 *
 * Merchant text came from a statement or a photo, so it goes through
 * IngestedText and is only ever text.
 */
export function MonthCharges({
  name,
  heading,
  month,
  actualCents,
  charges,
  onClose,
}: {
  name: string
  /** The Workbook list the category is on, e.g. "Variable expenses". */
  heading: string
  /** The month's first day. */
  month: string
  actualCents: number
  charges: readonly LedgerRow[]
  onClose: () => void
}) {
  const monthName = formatMonthTitle(month)
  return (
    <Sheet
      title={name}
      subtitle={
        <>
          {heading} · {monthName} · <span className="tnum">{formatCents(actualCents)}</span>
        </>
      }
      onClose={onClose}
    >
      {charges.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No charges filed here in {monthName.split(' ')[0]}.
        </p>
      ) : (
        <ul aria-label="Charges" className="divide-y">
          {charges.map((c) => (
            <li key={c.id} className="flex items-start gap-3 px-4 py-3">
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
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}
