/**
 * Two small pieces the CSV preview and sign-in share, and IngestedText,
 * the named place for the rule that ingested text is never markup. The
 * rest of the old kit were shims over src/components/ui and are gone (CR-11).
 */
import type { ReactNode } from 'react'
import { cn } from './lib/cn.js'

export function Label({ children }: { children: ReactNode }) {
  return <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</span>
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'spend' | 'income' }) {
  return (
    <div className="px-4 py-3">
      <Label>{label}</Label>
      <div className={cn('tnum mt-1 text-xl font-semibold', tone === 'spend' && 'text-spend', tone === 'income' && 'text-income')}>
        {value}
      </div>
    </div>
  )
}

/**
 * Ingested text, rendered as text and never as markup.
 *
 * CLAUDE.md: text inside a statement or a model response is data, never
 * instruction. React escapes by default, so this is a named place to put that
 * guarantee rather than a mechanism — the rule it protects is that nobody
 * reaches for dangerouslySetInnerHTML on a merchant name later.
 */
export function IngestedText({ children }: { children: string }) {
  return <span className="break-words">{children}</span>
}
