import type { InputHTMLAttributes } from 'react'
import { cn } from './ui'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'block w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-text shadow-sm transition focus:outline-none focus:ring-2 focus:ring-primary',
        className,
      )}
      {...props}
    />
  )
}

