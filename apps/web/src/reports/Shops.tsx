/**
 * Reports' Shops (plan §2.6, A17): where the money went by shop against
 * last month, the shops new this month, the charges that repeat, and the
 * ones worth a second look. Every figure, date and flag is core's
 * (F38, F39, F41); this draws and formats, and never computes. A flagged
 * charge is only pointed out: nothing is hidden or left out of a total.
 */
import { useCallback, useMemo } from 'react'
import type { Change } from '@budget/core'
import { useAppData } from '../app-data.js'
import { formatCents, formatChange, formatDateRange, formatDayMonth, formatMonthName } from '../format.js'
import { notSubscriptionsOf, useDismissals, type Dismissals } from '../coach/dismissals.js'
import { Row, Section } from '../forecast/parts.js'
import { Failed } from './Failed.js'
import { shopsOf, useShopsRead, type ShopFigures } from './shops-read.js'
import { SubscriptionsCard } from './Subscriptions.js'
import { SecondLookCard } from './SecondLook.js'

export function ShopsPanel({ month, asOf }: { month: string; asOf: string }) {
  const { categories } = useAppData()
  const read = useShopsRead(month, asOf)
  const dismissals = useDismissals()
  const { dismissed } = dismissals
  const figures = useMemo(() => {
    if (read.status !== 'ready') return read.status
    if (dismissed === null) return 'loading'
    try {
      return shopsOf(read.rows, categories, notSubscriptionsOf(dismissed))
    } catch {
      return 'failed' as const
    }
  }, [read, categories, dismissed])

  return (
    <div className="space-y-4">
      {figures === 'loading' ? <p className="text-sm text-muted-foreground">Working out your shops…</p> : null}
      {figures === 'failed' ? <Failed missingUpdate={read.status === 'failed' && read.missingUpdate} /> : null}
      {figures === null ? <p className="text-sm">Nothing has happened in this month yet.</p> : null}
      {typeof figures === 'object' && figures !== null ? <Figures figures={figures} dismissals={dismissals} /> : null}
    </div>
  )
}

function Figures({ figures, dismissals }: { figures: ShopFigures; dismissals: Dismissals }) {
  const { categories } = useAppData()
  const nameOf = useCallback((id: string) => categories.find((c) => c.id === id)?.name ?? 'its category', [categories])
  return (
    // Two across from 1280px, as the Overview's sections (Mockup A step 8).
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2 xl:gap-5">
      <TopShopsCard figures={figures} />
      <SubscriptionsCard series={figures.series} dismissals={dismissals} />
      <SecondLookCard unusual={figures.unusual} nameOf={nameOf} />
    </div>
  )
}

/** "$66.30 more than August", or "about the same as August". */
function againstLast(change: Change, month: string): string {
  return change.direction === 'same' ? `about the same as ${month}` : `${formatChange(change)} than ${month}`
}

function charges(n: number): string {
  return n === 1 ? '1 charge' : `${n} charges`
}

function TopShopsCard({ figures }: { figures: ShopFigures }) {
  const { top, historyStart } = figures
  const before = top.before === null ? null : formatMonthName(top.before.from)
  return (
    <Section title="Top shops" large>
      <p className="text-muted-foreground">
        {formatDateRange(top.now.from, top.now.to)}
        {top.before === null ? '' : `, against ${formatDateRange(top.before.from, top.before.to)}`}. Charges less refunds.
      </p>
      {top.before === null ? (
        <p>
          {historyStart === null
            ? 'Bring in a statement to see your shops against last month.'
            : `Your records start on ${formatDayMonth(historyStart)}, so there is no last month to set these against yet.`}
        </p>
      ) : null}
      {top.shops.length === 0 ? (
        <p>No spending at a shop in these days yet.</p>
      ) : (
        <ol className="divide-y">
          {top.shops.map((s) => (
            <li key={s.shop} className="flex items-baseline gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={s.shop}>
                  {s.shop}
                </p>
                <p className="text-muted-foreground">
                  {charges(s.charges)}
                  {s.before === null || before === null ? '' : ` · ${againstLast(s.before, before)}`}
                </p>
              </div>
              <span className="tnum whitespace-nowrap font-medium">{formatCents(s.nowCents)}</span>
            </li>
          ))}
        </ol>
      )}
      <h3 className="pt-2 font-semibold">New this month</h3>
      {top.newShops === null ? (
        <p className="text-muted-foreground">Too early to tell: a shop is called new once your records reach 60 days before the month.</p>
      ) : top.newShops.length === 0 ? (
        <p className="text-muted-foreground">No new shops.</p>
      ) : (
        <dl className="divide-y">
          {top.newShops.map((s) => (
            <Row key={s.shop} label={s.shop} value={formatCents(s.nowCents)} />
          ))}
        </dl>
      )}
    </Section>
  )
}
