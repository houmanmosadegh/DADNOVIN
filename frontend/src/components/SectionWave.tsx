import type { CSSProperties } from 'react'
import './SectionWave.css'

export type BandName = 'ink' | 'navy' | 'deep' | 'white' | 'gray' | 'cream' | 'goldblack' | 'goldwhite'

const BAND_VAR: Record<BandName, string> = {
  ink: 'var(--band-ink)',
  navy: 'var(--band-navy)',
  deep: 'var(--color-bg-deep)',
  white: 'var(--band-white)',
  gray: 'var(--band-gray)',
  cream: 'var(--band-cream)',
  goldblack: 'var(--band-goldblack)',
  goldwhite: 'var(--band-goldwhite)',
}

/**
 * Wave seam between two colour bands. The upper band's colour drapes
 * over the lower band in two staggered ridges — the front ridge opaque,
 * the back ridge faint — so sections flow instead of being cut by a
 * line. `flip` mirrors the curve so consecutive seams don't repeat.
 */
export function SectionWave({
  from,
  to,
  flip = false,
}: {
  /** band colour the wave carries downward (section above) */
  from: BandName
  /** band colour underneath the wave (section below) */
  to: BandName
  flip?: boolean
}) {
  return (
    <div
      className={`section-wave${flip ? ' section-wave--flip' : ''}`}
      style={
        {
          '--sw-over': BAND_VAR[from],
          '--sw-under': BAND_VAR[to],
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <svg viewBox="0 0 1440 110" preserveAspectRatio="none" focusable="false">
        <path
          className="section-wave__back"
          d="M0 0 H1440 V30 C1230 82 1050 14 800 40 C560 65 300 92 0 52 Z"
        />
        <path
          className="section-wave__front"
          d="M0 0 H1440 V58 C1180 104 920 36 660 66 C420 94 190 82 0 44 Z"
        />
      </svg>
    </div>
  )
}
