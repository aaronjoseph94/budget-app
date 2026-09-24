import type { PayoffStrategies, PayoffStrategy } from '@budget/core'
import { formatCents, formatMonthTitle } from '../format.js'

/**
 * The debt-free month on three plans, side by side (D2, F23): Workbook's,
 * each debt paying its own minimum for life, and the snowball and the
 * avalanche, which roll a cleared debt's payment into the next. Every
 * figure is core's (payoffStrategies); Workbook cannot check the last two.
 */
const PLANS: readonly { key: PayoffStrategy; name: string; how: string }[] = [
  { key: 'flat', name: 'Minimums only', how: 'Each debt pays its own minimum until it is paid off.' },
  { key: 'snowball', name: 'Snowball', how: 'When a debt is paid off, its payment goes to the smallest balance left.' },
  { key: 'avalanche', name: 'Avalanche', how: 'When a debt is paid off, its payment goes to the highest APR left.' },
]

export function DebtStrategies({ strategies }: { strategies: PayoffStrategies }) {
  return (
    <section aria-label="Payoff plans" className="space-y-3 rounded-xl bg-card p-4 shadow-sm">
      <h2 className="font-title text-3xl font-bold">Ways to pay it off</h2>
      <p className="text-sm">The same amount each month, spent three ways: what you pay now, plus what a paid-off debt frees up.</p>
      <ul className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => {
          const outcome = strategies[p.key]
          return (
            <li key={p.key} aria-label={p.name} className="rounded-lg border border-debt-paid p-3">
              <h3 className="font-semibold">{p.name}</h3>
              <dl className="mt-2 space-y-1">
                <div>
                  <dt className="text-xs text-debt-label">Debt-free by</dt>
                  <dd className="text-lg font-semibold">{outcome === null ? 'Not within 50 years' : formatMonthTitle(outcome.debtFreeDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-debt-label">Interest paid</dt>
                  <dd className="tnum">{outcome === null ? '—' : formatCents(outcome.totalInterestCents)}</dd>
                </div>
              </dl>
              <p className="mt-2 text-xs">{p.how}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
