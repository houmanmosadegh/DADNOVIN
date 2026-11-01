import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

interface ButtonProps {
  to: string
  children: ReactNode
  variant?: 'primary' | 'ghost'
  className?: string
}

/** Link styled as a button — real navigation, no dead controls.
 *  Primary carries a directional arrow (RTL forward = left) that nudges on hover. */
export function Button({ to, children, variant = 'primary', className = '' }: ButtonProps) {
  return (
    <Link to={to} className={`btn btn--${variant}${className ? ` ${className}` : ''}`}>
      <span className="btn__label">{children}</span>
      {variant === 'primary' ? (
        <ArrowLeft className="btn__arrow" size={17} strokeWidth={2.1} aria-hidden="true" />
      ) : null}
    </Link>
  )
}
