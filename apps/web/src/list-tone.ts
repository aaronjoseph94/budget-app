import type { PeriodSheet } from '@budget/core'
import type { IconName } from './components/ui/icons.js'

/** The six lists a period sheet has: every list but Not spending. */
export type ListKind = keyof PeriodSheet['blocks']

/**
 * Each list's hue on every screen (ADR 0010): orange Variable, sky Bills,
 * violet Subscriptions, rose Debts, green Income, amber Savings. `bar` and
 * `icon` carry no words; every word on the list's surfaces is its `ink`.
 * Orange draws its icon in #ea580c, as the review asks for any orange mark.
 * Written out for Tailwind.
 */
export const LIST_TONE: Readonly<Record<ListKind, { header: string; ink: string; tile: string; icon: string; bar: string; glyph: IconName }>> = {
  income: { header: 'bg-income-header', ink: 'text-income-ink', tile: 'bg-income-tile', icon: 'text-income-accent', bar: 'bg-income-accent', glyph: 'dollar' },
  savings: { header: 'bg-savings-header', ink: 'text-savings-ink', tile: 'bg-savings-tile', icon: 'text-savings-accent', bar: 'bg-savings-accent', glyph: 'piggy' },
  bill: { header: 'bg-bills-header', ink: 'text-bills-ink', tile: 'bg-bills-tile', icon: 'text-bills-accent', bar: 'bg-bills-accent', glyph: 'home' },
  debt: { header: 'bg-debts-header', ink: 'text-debts-ink', tile: 'bg-debts-tile', icon: 'text-debts-accent', bar: 'bg-debts-accent', glyph: 'card' },
  subscription: {
    header: 'bg-subscriptions-header',
    ink: 'text-subscriptions-ink',
    tile: 'bg-subscriptions-tile',
    icon: 'text-subscriptions-accent',
    bar: 'bg-subscriptions-accent',
    glyph: 'monitor',
  },
  variable: { header: 'bg-variable-header', ink: 'text-variable-ink', tile: 'bg-variable-tile', icon: 'text-variable-large', bar: 'bg-variable-accent', glyph: 'bag' },
}
