import { useEffect } from 'react'
import Lenis from 'lenis'

let lenis: Lenis | null = null
/** Access the shared Lenis instance (null before mount / reduced-motion / SSR). */
export const getLenis = () => lenis

/**
 * Butter-smooth wheel scrolling for the whole app. Native scroll stays real
 * (sticky/fixed keep working); other code just reads window.scrollY as usual.
 * Disabled under prefers-reduced-motion — falls back to native scrolling.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return
    }
    lenis = new Lenis({
      lerp: 0.09,
      smoothWheel: true,
      wheelMultiplier: 1.05,
      touchMultiplier: 1.2,
      // same-page #anchors (skip-link etc.) glide instead of jumping;
      // offset keeps targets clear of the sticky header
      anchors: { offset: -88 },
    })
    // exposed for debugging/e2e tooling — read-only handle, no API surface
    ;(window as unknown as { __lenis?: Lenis }).__lenis = lenis
    let raf = window.requestAnimationFrame(function loop(t) {
      lenis?.raf(t)
      raf = window.requestAnimationFrame(loop)
    })
    return () => {
      window.cancelAnimationFrame(raf)
      lenis?.destroy()
      lenis = null
      delete (window as unknown as { __lenis?: Lenis }).__lenis
    }
  }, [])
  return null
}
