import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn.js'

/** shadcn/ui Badge. */
const BADGE = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  outline: 'border text-foreground',
  spend: 'bg-spend/12 text-spend',
  income: 'bg-income/12 text-income',
  warning: 'bg-warning/15 text-warning',
} as const

export function Badge({
  variant = 'secondary',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof BADGE }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        BADGE[variant],
        className,
      )}
      {...props}
    />
  )
}

/**
 * shadcn/ui Progress, driven by basis points from the engine.
 *
 * Takes basis points rather than a percentage so the screen passes the engine's
 * number through untouched (invariant 1). Clamped for DRAWING only; the figure
 * beside the bar shows the true value, including when it is over 100%.
 */
export function Progress({ basisPoints, tone = 'default' }: { basisPoints: number; tone?: 'default' | 'over' | 'near' }) {
  const width = `${Math.min(10_000, Math.max(0, basisPoints)) / 100}%`
  const fill = tone === 'over' ? 'bg-spend-bar' : tone === 'near' ? 'bg-warning' : 'bg-primary'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary" role="presentation">
      <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width }} />
    </div>
  )
}

/** shadcn/ui Alert. `role="alert"` on failures so a screen reader announces them. */
export function Alert({
  tone = 'default',
  title,
  children,
}: {
  tone?: 'default' | 'success' | 'error'
  title?: string
  children?: ReactNode
}) {
  const look =
    tone === 'error'
      ? 'border-destructive/40 bg-destructive/5 text-destructive'
      : tone === 'success'
        ? 'border-income/40 bg-income/5'
        : 'bg-card'
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('rounded-lg border px-4 py-3 text-sm', look)}>
      {title !== undefined ? <p className="font-medium">{title}</p> : null}
      {children !== undefined ? <div className={cn(title !== undefined && 'mt-1', tone === 'error' ? '' : 'text-muted-foreground')}>{children}</div> : null}
    </div>
  )
}

/** A centred empty state: what is missing, and the one thing to do about it. */
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      {icon !== undefined ? <div className="mb-1 rounded-full bg-secondary p-3 text-muted-foreground">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {children !== undefined ? <div className="max-w-sm text-sm text-muted-foreground">{children}</div> : null}
    </div>
  )
}
