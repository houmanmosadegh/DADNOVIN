import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

export type RevealVariant = 'up' | 'x-start' | 'x-end' | 'clip' | 'line' | 'fade'

interface RevealProps {
  children: ReactNode
  className?: string
  /** stagger delay in ms */
  delay?: number
  /** entrance pattern — one component, shared IntersectionObserver logic */
  variant?: RevealVariant
  style?: CSSProperties
}

/**
 * Reveals content once when it enters the viewport (single-shot).
 * Variants: up (default), x-start/x-end (horizontal, collapses to
 * vertical on mobile), clip (image un-crop), line (divider draw),
 * fade (opacity only). All motion is disabled under reduced-motion.
 */
export function Reveal({ children, className = '', delay = 0, variant = 'up', style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return

    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduce || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const io = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          io.disconnect()
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -6% 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  return (
    <div
      ref={ref}
      className={`reveal reveal--${variant}${visible ? ' is-visible' : ''}${className ? ` ${className}` : ''}`}
      style={{ transitionDelay: delay ? `${delay}ms` : undefined, ...style }}
    >
      {children}
    </div>
  )
}
