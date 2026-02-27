import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './ui'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-6 shadow-md transition-shadow hover:shadow-lg',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

