import { useState, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * The app's two display styles, in the system face (ADR 0010).
 *
 * The month title is Mockup A's page title, 32px bold, pulled in a little,
 * in the title ink. It takes no className: its size, face and colour are
 * the style, so a caller has nothing to override (see lib/cn.ts).
 */
export function MonthTitle({ children }: { children: ReactNode }) {
  // Never more than 15% of the screen's width: with the phone's text at
  // 200% a month name was wider than the screen and broke inside the word
  // (N58). Where even that cannot fit, the word may break.
  return <h1 className="text-[min(2rem,15vw)] font-bold leading-tight tracking-[-0.02em] text-title-ink [overflow-wrap:anywhere]">{children}</h1>
}

/**
 * A big number standing on its own, in tabular figures so it does not
 * shift as it changes. Size and colour belong to the caller, so this sets
 * neither.
 *
 * When its value changes it cross-fades in place (`figure-change`, after
 * transitions.dev's "number subtle change"): drawn anew under a new key, so
 * the fade plays each time, and never on its first draw, so a screen that
 * opens does not flicker every number at once.
 */
export function Figure({ className, children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null
  // The value last drawn, and how many times it has changed (React's
  // pattern for keeping what an earlier render saw).
  const [seen, setSeen] = useState({ text, changes: 0 })
  if (text !== seen.text) setSeen({ text, changes: seen.changes + 1 })
  // May break inside the number, and only when it cannot fit its box at all:
  // with text enlarged to 200% a total ran out of its card instead (FE-17).
  return (
    <span key={seen.changes} className={cn('tnum whitespace-nowrap', seen.changes > 0 && 'figure-change', className)} {...props}>
      {children}
    </span>
  )
}
