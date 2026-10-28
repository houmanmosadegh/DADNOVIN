import { useEffect, useState } from 'react'

interface TypewriterProps {
  text: string
  /** ms per character */
  speed?: number
  className?: string
}

/**
 * Types out a short phrase once. Under `prefers-reduced-motion` the full
 * text is rendered immediately with no animation.
 */
export function Typewriter({ text, speed = 55, className }: TypewriterProps) {
  const [shown, setShown] = useState(0)
  const done = shown >= text.length

  useEffect(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setShown(text.length)
      return
    }
    if (shown >= text.length) return
    const id = window.setTimeout(() => setShown((n) => n + 1), speed)
    return () => window.clearTimeout(id)
  }, [shown, text.length, speed])

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, shown)}
        <span className={`typewriter__caret${done ? ' is-done' : ''}`} />
      </span>
    </span>
  )
}
