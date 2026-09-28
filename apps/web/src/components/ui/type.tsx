import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * The workbook's two display styles (plan §6.6).
 *
 * The month title is Caveat bold, as on Jan!B3, in the darker sea-glass ink
 * that stays readable on the title band; the workbook's own #ABBFBD there is 1.87 to
 * one. It takes no className: its size, face and colour are the style, so a
 * caller has nothing to override (see lib/cn.ts).
 */
export function MonthTitle({ children }: { children: ReactNode }) {
  // "September" alone is wider than a 320 px phone with its text at 200%;
  // only then does the word break (N58).
  return <h1 className="font-title text-5xl font-bold leading-none text-title-ink [overflow-wrap:anywhere]">{children}</h1>
}

/**
 * A big number in Comfortaa, as the workbook draws its totals.
 *
 * Size and colour belong to the caller, so this sets neither. Comfortaa has
 * no tabular figures (its 1 is narrower than its other digits, and it carries
 * no `tnum` feature), so this is for a figure standing on its own. Columns of
 * amounts that must line up stay in the system face with `tnum`. The `tnum`
 * here still holds for the system face shown while Comfortaa loads.
 */
export function Figure({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  // May break inside the number, and only when it cannot fit its box at all:
  // with text enlarged to 200% a total ran out of its card instead (FE-17).
  return <span className={cn('font-numbers tnum [overflow-wrap:anywhere]', className)} {...props} />
}
