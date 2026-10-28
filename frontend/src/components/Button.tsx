import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ButtonProps {
  to: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
  className?: string
}

/** Link styled as a button — real navigation, no dead controls. */
export function Button({
  to,
  children,
  variant = 'primary',
  className = '',
}: ButtonProps) {
  return (
    <Link to={to} className={`btn btn--${variant}${className ? ` ${className}` : ''}`}>
      {children}
    </Link>
  )
}
