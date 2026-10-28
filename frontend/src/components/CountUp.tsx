import { useEffect, useRef, useState } from 'react'

const faNum = new Intl.NumberFormat('fa-IR')

interface CountUpProps {
  value: number
  suffix?: string
  duration?: number
  className?: string
}

/** One-shot count-up on first viewport entry; instant under reduced-motion. */
export function CountUp({ value, suffix = '', duration = 950, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)
  // initial render shows the real value — prerendered HTML stays correct for
  // crawlers/no-JS; the effect rewinds to 0 only when the count actually starts
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    const el = ref.current
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || calm || !('IntersectionObserver' in window)) {
      setDisplay(value)
      return
    }
    let raf = 0
    const start = () => {
      setDisplay(0)
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - t0) / duration)
        setDisplay(Math.round(value * (1 - Math.pow(1 - t, 3))))
        if (t < 1) raf = window.requestAnimationFrame(tick)
      }
      raf = window.requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          start()
        }
      },
      { threshold: 0.6 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [value, duration])

  return (
    <span ref={ref} className={className}>
      {faNum.format(display)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  )
}
