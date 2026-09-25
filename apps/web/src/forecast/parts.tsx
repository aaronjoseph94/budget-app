/**
 * What the Forecast's cards share (plan §2.5, A13): a titled card, the one
 * line that asks for this month's start where a balance would be (D17), and
 * a label with its figure. Display only.
 */
import type { ReactNode } from 'react'
import { hashOf } from '../nav.js'
import { Card, CardContent, CardTitle } from '../components/ui/card.js'

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <div className="p-5 pb-2">
        <CardTitle as="h2">{title}</CardTitle>
      </div>
      <CardContent className="space-y-3 text-sm">{children}</CardContent>
    </Card>
  )
}

export function NoStart() {
  return (
    <p>
      Type this month’s starting balance to see where you’ll end.{' '}
      <a href={hashOf({ screen: 'month', param: null })} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
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
