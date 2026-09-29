/**
 * What the Forecast's cards share (plan §2.5, A13): a titled card, the one
 * line that asks for this month's start where a balance would be (D17), and
 * a label with its figure. Display only.
 */
import type { ReactNode } from 'react'
import { hashOf } from '../nav.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'
import { Icon, type IconName } from '../components/ui/icons.js'
import { SENTENCE_LINK } from '../components/ui/link.js'
import { cn } from '../lib/cn.js'

/**
 * `flat` and `className` let a screen restyle the card, as the check-in does
 * (Mockup A step 7). `large` is Mockup A's section card (step 8): no shadow,
 * an 18px title, 24px sides and 15px words.
 */
export function Section({ title, children, flat = false, large = false, className }: { title: string; children: ReactNode; flat?: boolean; large?: boolean; className?: string }) {
  if (large) {
    return (
      <Card flat className={cn('min-w-0', className)}>
        <h2 className="px-5 pt-5 pb-3 text-lg font-semibold leading-tight tracking-tight md:px-6 md:pt-6">{title}</h2>
        <div className="space-y-3 px-5 pb-5 text-[0.9375rem] md:px-6 md:pb-6">{children}</div>
      </Card>
    )
  }
  return (
    <Card flat={flat} className={className}>
      <div className="p-5 pb-2">
        <CardTitle as="h2">{title}</CardTitle>
      </div>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  )
}

/**
 * Mockup A's stat card with a heading, as the Month's StatCard looks (step 3)
 * but holding sentences, badges and a drawing, not one term. `hero` is the
 * one card tinted to the accent; muted words on it take `canvas-muted`, which
 * reads on the tint (ADR 0010).
 */
export function StatSection({ title, icon, hero = false, children }: { title: string; icon: IconName; hero?: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'min-w-0 space-y-2 rounded-xl border p-4 text-[0.9375rem] md:px-6 md:pt-5 md:pb-6',
        hero ? 'bg-linear-to-b from-card to-primary-tint [--muted-foreground:var(--canvas-muted)]' : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-normal text-muted-foreground md:text-base">{title}</h2>
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon name={icon} className="size-[1.125rem]" />
        </span>
      </div>
      {children}
    </div>
  )
}

export function NoStart() {
  return (
    <p>
      Type this month’s starting balance to see where you’ll end.{' '}
      <a href={hashOf({ screen: 'month', param: null })} className={SENTENCE_LINK}>
        Open the Month
      </a>
    </p>
  )
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="min-w-0 text-muted-foreground">{label}</dt>
      <dd className="tnum whitespace-nowrap font-medium">{value}</dd>
    </div>
  )
}
