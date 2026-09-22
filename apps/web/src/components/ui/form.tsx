import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

/**
 * shadcn/ui Input, Label, and a native Select.
 *
 * Native <select> rather than shadcn's Radix popover: on an iPhone the native
 * picker is the wheel people already know, it is fully accessible for free,
 * and it costs no dependency.
 */
// No height or horizontal padding here: those vary by use, and a caller must
// never have to override a base class (see lib/cn.ts).
const FIELD =
  'flex w-full rounded-md border border-input bg-card py-2 text-base shadow-xs transition-colors ' +
  'placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] ' +
  'focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

export function Input({
  className,
  size = 'default',
  inset = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'default' | 'sm'; inset?: boolean }) {
  return (
    <input
      className={cn(FIELD, size === 'sm' ? 'h-9' : 'h-11', inset ? 'pl-6 pr-3' : 'px-3', className)}
      {...props}
    />
  )
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD, 'h-11 appearance-none bg-no-repeat pl-3 pr-9', className)} style={CHEVRON} {...props}>
      {children}
    </select>
  )
}

const CHEVRON = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 0.75rem center',
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />
}

/** A labelled field: label above, control, optional hint below. */
export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint !== undefined ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}
