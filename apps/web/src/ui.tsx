/**
 * The original small kit, now drawn with the shadcn/ui components in
 * src/components/ui. Kept so the CSV preview and the sign-in screen keep
 * their imports; new screens use the components directly.
 */
import type { ReactNode } from 'react'
import { Button as UiButton } from './components/ui/button.js'
import { Card as UiCard } from './components/ui/card.js'
import { NativeSelect } from './components/ui/form.js'
import { cn } from './lib/cn.js'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <UiCard className={className}>{children}</UiCard>
}

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

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'quiet'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <UiButton type={type} onClick={onClick} disabled={disabled} variant={variant === 'primary' ? 'default' : 'outline'}>
      {children}
    </UiButton>
  )
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { readonly value: T; readonly label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <NativeSelect
        value={String(value)}
        onChange={(e) => {
          const picked = options.find((o) => String(o.value) === e.target.value)
          if (picked !== undefined) onChange(picked.value)
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </label>
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
