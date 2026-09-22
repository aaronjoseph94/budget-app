import type { ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-line bg-raised ${className}`}>{children}</div>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-medium uppercase tracking-wide text-ink-soft">{children}</span>
  )
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'spend' | 'income' }) {
  const colour = tone === 'spend' ? 'text-spend' : tone === 'income' ? 'text-income' : 'text-ink'
  return (
    <div className="px-4 py-3">
      <Label>{label}</Label>
      <div className={`tnum mt-1 text-xl font-semibold ${colour}`}>{value}</div>
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
  const base =
    'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed'
  const look =
    variant === 'primary'
      ? 'bg-accent text-white hover:opacity-90'
      : 'border border-line text-ink hover:bg-surface'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${look}`}>
      {children}
    </button>
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
    <label className="block">
      <Label>{label}</Label>
      <select
        className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink"
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
      </select>
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
