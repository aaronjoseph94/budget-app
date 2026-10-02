import type { PayoffStrategies, PayoffStrategy } from '@budget/core'
import { formatCents, formatMonthTitle } from '../format.js'
import { cn } from '../lib/cn.js'

/** The three plans, in the order drawn; 'flat' is debtPlan's, the workbook's. */
const PLANS: readonly { key: PayoffStrategy; name: string; how: string }[] = [
  { key: 'flat', name: 'Minimums only', how: 'Each debt pays its own minimum until it is paid off.' },
  { key: 'snowball', name: 'Snowball', how: 'When a debt is paid off, its payment goes to the smallest balance left.' },
  { key: 'avalanche', name: 'Avalanche', how: 'When a debt is paid off, its payment goes to the highest APR left.' },
]

/**
 * The debt-free month on three plans, side by side (D2, F23): the workbook's,
 * each debt paying its own minimum for life, and the snowball and the
 * avalanche, which roll a cleared debt's payment into the next. Every
 * figure is core's (payoffStrategies); the workbook cannot check the last two.
 *
 * Minimums only is tinted to the accent: it is the plan the summary above
 * follows (debtPlan), the one chosen, as Mockup A tints its chosen plan.
 */
export function DebtStrategies({ strategies }: { strategies: PayoffStrategies }) {
  return (
    <section aria-label="Payoff plans" className="space-y-3 rounded-xl border bg-card p-4 md:px-6 md:py-5">
      <h2 className="text-lg font-semibold leading-tight">Ways to pay it off</h2>
      <p className="text-sm text-muted-foreground md:text-[0.9375rem]">The same amount each month, spent three ways: what you pay now, plus what a paid-off debt frees up.</p>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const outcome = strategies[p.key]
          return (
            <li
              key={p.key}
              aria-label={p.name}
              className={cn('rounded-xl border p-4', p.key === 'flat' && 'bg-primary-tint [--muted-foreground:var(--canvas-muted)]')}
            >
              <h3 className="font-semibold">{p.name}</h3>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-xs text-muted-foreground">Debt-free by</dt>
                  <dd className="text-lg font-bold">{outcome === null ? 'Not within 50 years' : formatMonthTitle(outcome.debtFreeDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Interest paid</dt>
                  <dd className="tnum">{outcome === null ? '—' : formatCents(outcome.totalInterestCents)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">{p.how}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
