import { Reveal } from './Reveal'
import './SectionDivider.css'

const ART = {
  src: '/images/symbol-column-384.webp',
  srcSet: '/images/symbol-column-384.webp 384w, /images/symbol-column-640.webp 640w',
  w: 384,
  h: 643,
} as const

/**
 * Gold hairline — courthouse-column mark — gold hairline. One consistent
 * mark for every divider so they all sit on the same visual axis; lines
 * draw outward from center on scroll-in. Decorative (aria-hidden).
 */
export function SectionDivider() {
  const art = ART
  return (
    <Reveal variant="line" className="section-divider-wrap">
      <div className="section-divider" role="separator" aria-hidden="true">
        <span className="section-divider__line" />
        <img
          className="section-divider__mark"
          src={art.src}
          srcSet={art.srcSet}
          sizes="5rem"
          alt=""
          width={art.w}
          height={art.h}
          loading="lazy"
          decoding="async"
        />
        <span className="section-divider__line" />
      </div>
    </Reveal>
  )
}
