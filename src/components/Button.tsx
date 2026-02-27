import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './ui'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'link'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  children: ReactNode
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center rounded-md text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed'

  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-cta text-surface px-4 py-2 shadow-md hover:shadow-lg hover:-translate-y-px',
    secondary: 'border-2 border-primary text-primary bg-transparent px-4 py-2 hover:bg-primary hover:text-surface',
    ghost: 'text-text-muted px-2 py-1 hover:bg-red-100 hover:text-red-700',
    link: 'bg-transparent text-primary px-0 py-0 underline-offset-2 hover:underline',
  }

  return (
    <button
      type={props.type ?? 'button'}
      className={cn(base, variants[variant], className)}
      {...props}
    >
      {children}
    </button>
  )
}

