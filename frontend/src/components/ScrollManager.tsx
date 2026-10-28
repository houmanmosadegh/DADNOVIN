import { useEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { getLenis } from './SmoothScroll'

/**
 * Restores scroll position on navigation and honors in-page hash targets
 * (e.g. /services#contracts) after the destination has painted.
 * Uses the shared Lenis instance when smooth scrolling is active.
 * POP (back/forward) is left alone — the browser restores the position.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  const navType = useNavigationType()

  useEffect(() => {
    const lenis = getLenis()
    if (!hash) {
      if (navType === 'POP') return // let the browser restore scroll on back/forward
      lenis ? lenis.scrollTo(0, { immediate: true }) : window.scrollTo(0, 0)
      return
    }
    // anchors sit inside Reveal animations — measure after they settle, then
    // re-verify once the smooth scroll finishes (layout can keep moving and
    // throw the landing off by a header-height or more)
    const target = 88 // element top sits just under the sticky header
    const go = (immediate: boolean) => {
      const el = document.getElementById(hash.slice(1))
      if (!el) return
      const top = el.getBoundingClientRect().top
      if (Math.abs(top - target) < 4) return
      const y = el.getBoundingClientRect().top + window.scrollY - target
      lenis ? lenis.scrollTo(y, { immediate }) : window.scrollTo(0, y)
    }
    const timers = [
      window.setTimeout(() => go(false), 150),
      window.setTimeout(() => go(false), 950), // correction pass after settle
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [pathname, hash, navType])

  return null
}
