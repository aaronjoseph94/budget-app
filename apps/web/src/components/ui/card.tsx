import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

/** shadcn/ui Card and its parts. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1 p-5 pb-3', className)} {...props} />
}

/**
 * A card's heading, an h3 unless told otherwise. A card straight under a
 * screen's h1 takes `as="h2"`, or its screen's outline skips a level (FE-12).
 */
export function CardTitle({ className, as: Heading = 'h3', ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: 'h2' | 'h3' }) {
  return <Heading className={cn('text-base font-semibold leading-none tracking-tight', className)} {...props} />
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // No top padding: a header above supplies the gap. Without a header, pass pt-5.
  return <div className={cn('px-5 pb-5', className)} {...props} />
}
