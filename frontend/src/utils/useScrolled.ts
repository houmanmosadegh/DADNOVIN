import { useEffect, useState } from 'react'

/**
 * Returns true when the window has been scrolled past `threshold` (px).
 * Uses a single passive scroll listener; state only flips on threshold crossing.
 */
export function useScrolled(threshold = 24): boolean {
  // Start false so SSR markup and the first client render always agree;
  // the effect below sets the real value on mount (no hydration mismatch).
  const [scrolled, setScrolled] = useState<boolean>(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])

  return scrolled
}
