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
  'focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11'

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

/**
 * An on/off switch, for a checkbox with `role="switch"` (N82). The
 * browser's own box read as "tick to agree"; this is a track with a knob
 * that slides right and fills with the primary colour when on. Drawn with
 * backgrounds alone, so it needs no markup beyond the input, and the knob
 * is the card's colour so it shows on the track in both schemes. The
 * input's row, its <label>, is the 44 px target.
 */
export const SWITCH =
  'h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-muted-foreground bg-left bg-no-repeat ' +
  'bg-[length:1.75rem_1.75rem] [background-image:radial-gradient(circle,var(--card)_55%,transparent_58%)] ' +
  'transition-[background-position,background-color] motion-reduce:transition-none checked:bg-primary checked:bg-right ' +
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

const CHEVRON = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: 'right 0.75rem center',
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />
}

/**
 * What marks a field refused and ties it to the words saying why, `id`
 * being theirs (FE-8). One helper where five forms each wrote their own,
 * and the single-field editors, which said why in an alert, tied theirs to
 * nothing (CR-14).
 */
export function refusal(id: string, refused: boolean): { 'aria-invalid'?: true; 'aria-describedby'?: string } {
  return refused ? { 'aria-invalid': true, 'aria-describedby': id } : {}
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

/**
 * A labelled picker over typed options: the value handed back is the
 * option's own, a number stays a number. Moved here from the old ui.tsx
 * kit, whose Button and Card were only shims over these components (CR-11).
 */
export function OptionSelect<T extends string | number>({
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
