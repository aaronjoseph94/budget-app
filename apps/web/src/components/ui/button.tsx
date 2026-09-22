import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

/** shadcn/ui Button, with its variants as plain maps instead of cva. */
const VARIANTS = {
  default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border bg-card shadow-sm hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90',
  link: 'text-primary underline-offset-4 hover:underline',
} as const

const SIZES = {
  default: 'h-10 px-4 py-2',
  sm: 'h-8 rounded-md px-3 text-xs',
  lg: 'h-12 rounded-lg px-6 text-base',
  icon: 'size-10',
} as const

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: keyof typeof VARIANTS
  readonly size?: keyof typeof SIZES
}

export function Button({ variant = 'default', size = 'default', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors',
        'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}
