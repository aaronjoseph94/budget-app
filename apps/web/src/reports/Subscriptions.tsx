/**
 * Reports → Shops' regular charges (plan §2.6, A17; F38): how often each
 * comes, its price, its next date and a year of it, a price change, and
 * "Not a subscription", kept in 0017's insight_dismissals so the shop is
 * never called one again, on any device. Without 0017 the button is not
 * offered, and one line says why. Every figure is core's.
 */
import { useState } from 'react'
import type { Cadence, RecurringCharge } from '@budget/core'
import { formatCents, formatDayMonth } from '../format.js'
import { hashOf } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Badge } from '../components/ui/feedback.js'
import { notSubscriptionCause, type Dismissals } from '../coach/dismissals.js'
import { Section } from '../forecast/parts.js'

const CADENCE: Readonly<Record<Cadence, string>> = { weekly: 'Weekly', fortnightly: 'Every two weeks', monthly: 'Monthly', yearly: 'Yearly' }

export function SubscriptionsCard({ series, dismissals }: { series: readonly RecurringCharge[]; dismissals: Dismissals }) {
  const [problem, setProblem] = useState<string | null>(null)
  const mark = async (cause: string) => {
    setProblem(null)
    if (!(await dismissals.dismiss(cause))) setProblem('That could not be saved. Check your connection and try again.')
  }
  return (
    <Section title="Subscriptions and regular charges">
      <p className="text-muted-foreground">Charges that come at steady gaps for a steady amount. The next date is a guess from the gaps so far.</p>
      {series.length === 0 ? (
        <p>None found yet. A charge shows here once it has come three times at steady gaps.</p>
      ) : (
        <ul className="divide-y">
          {series.map((s) => {
            const cause = notSubscriptionCause(s.shop)
            return (
              <li key={s.shop} className="space-y-1 py-3">
                <div className="flex items-baseline gap-3">
                  <p className="min-w-0 flex-1 truncate font-medium" title={s.shop}>
                    {s.shop}
                  </p>
                  {s.isNew ? <Badge>New</Badge> : null}
                  <span className="tnum whitespace-nowrap font-medium">{formatCents(s.priceCents)}</span>
                </div>
                <p className="text-muted-foreground">
                  {CADENCE[s.cadence]} · next about {formatDayMonth(s.next)} · <span className="tnum">{formatCents(s.yearCents)}</span> a year
                </p>
                {s.priceChange === null ? null : (
                  <p className={s.priceChange.direction === 'up' ? 'font-medium text-spend' : ''}>
                    Price went {s.priceChange.direction} from <span className="tnum">{formatCents(s.priceChange.beforeCents)}</span> to{' '}
                    <span className="tnum">{formatCents(s.priceChange.nowCents)}</span>
                  </p>
                )}
                {dismissals.canDismiss && cause !== null ? (
                  <Button variant="outline" size="sm" className="min-h-11" onClick={() => void mark(cause)}>
                    Not a subscription<span className="sr-only">: {s.shop}</span>
                  </Button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {problem === null ? null : (
        <p role="alert" className="text-destructive">
          {problem}
        </p>
      )}
      {dismissals.dismissed === null || dismissals.canDismiss || series.length === 0 ? null : dismissals.missingUpdate ? (
        <p>
          Marking one as not a subscription needs a one-time update.{' '}
          <a href={hashOf({ screen: 'help', param: 'updates' })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
            See One-time updates
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">Marking one as not a subscription is not available right now. Reload to try again.</p>
      )}
    </Section>
  )
}
