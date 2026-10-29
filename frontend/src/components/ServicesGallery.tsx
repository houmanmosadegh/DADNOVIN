import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from './Button'
import { Reveal } from './Reveal'
import { StatueParticles } from './StatueParticles'
import { trackGlow } from '../utils/pointerGlow'
import { cta, home, services, servicesPage } from '../content/lawyers.fa.js'
import './ServicesGallery.css'

/**
 * Shared services gallery — «مجسمه روی خط طلایی» header + six black-marble
 * emblem cards in a 2×3 grid (reference layout). variant="home" links each
 * card to /services#slug; variant="page" turns the grid into a visual index
 * that scrolls to the matching detail article on the same page.
 */

/** intrinsic 384w size of each tight-cropped symbol — keeps CLS at zero */
const SYMBOL_DIMS: Record<string, { w: number; h: number }> = {
  book: { w: 384, h: 508 },
  column: { w: 384, h: 643 },
  gavel: { w: 384, h: 305 },
}

/** subtle pointer tilt (≤5deg) + marble spotlight — mouse only */
function trackCard(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  trackGlow(e)
  if (e.pointerType !== 'mouse') return
  const r = el.getBoundingClientRect()
  const nx = (e.clientX - r.left) / r.width - 0.5
  const ny = (e.clientY - r.top) / r.height - 0.5
  el.style.setProperty('--tx', `${(ny * -4).toFixed(2)}deg`)
  el.style.setProperty('--ty', `${(nx * 4).toFixed(2)}deg`)
}
function resetCard(e: React.PointerEvent<HTMLElement>) {
  const el = e.currentTarget
  el.style.setProperty('--tx', '0deg')
  el.style.setProperty('--ty', '0deg')
}

export function ServicesGallery({ variant = 'home' }: { variant?: 'home' | 'page' }) {
  const isPage = variant === 'page'
  const [statueEl, setStatueEl] = useState<HTMLImageElement | null>(null)
  const Title = isPage ? 'h1' : 'h2'
  const CardTitle = isPage ? 'h2' : 'h3'
  const head = {
    eyebrow: home.services.eyebrow,
    title: isPage ? servicesPage.title : home.services.title,
    lead: isPage ? servicesPage.lead : home.services.lead,
  }
  const ctaLink = isPage ? cta.services : home.services.cta
  const cardCta = isPage ? servicesPage.cardCta : home.services.cardCta

  /* row-pair entrance stagger — each row fades in after the one above */
  const delayFor = (i: number) => (i % 2) * 90 + Math.floor(i / 2) * 60

  /* ≤8px statue parallax — mouse only */
  const onHeadPointer = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const nx = (e.clientX - r.left) / r.width - 0.5
    const ny = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--sx', `${(nx * 8).toFixed(1)}px`)
    el.style.setProperty('--sy', `${(ny * 6).toFixed(1)}px`)
  }

  return (
    <section
      className={`sg${isPage ? ' sg--page' : ' section band band--gray'}`}
      id={isPage ? undefined : 'services'}
      aria-labelledby={isPage ? 'services-page-title' : 'services-title'}
    >
      <div className="container">
        {/* header: statue standing on the bronze hairline, title centred —
            the statue+particles live here only on /services; on the homepage
            they stand in the hero instead */}
        <header
          className={`sg__head${isPage ? '' : ' sg__head--plain'}`}
          onPointerMove={isPage ? onHeadPointer : undefined}
        >
          {isPage ? (
            <Reveal variant="fade" className="sg__stage">
              <div className="sg__decor" aria-hidden="true">
                {statueEl ? <StatueParticles target={statueEl} /> : null}
                <img
                  ref={setStatueEl}
                  className="sg__statue"
                  src="/images/man-legal.webp"
                  width="561"
                  height="755"
                  alt=""
                  draggable={false}
                  loading="eager"
                  decoding="async"
                />
                <img
                  className="sg__reflection"
                  src="/images/man-legal.webp"
                  width="561"
                  height="755"
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                />
                <span className="sg__shadow" />
              </div>
              <span className="sg__line" aria-hidden="true">
                <i className="sg__line-diamond" />
              </span>
            </Reveal>
          ) : null}
          <Reveal className="sg__text">
            <span className="sg__eyebrow">
              {isPage ? null : <b aria-hidden="true">۰۳</b>}
              {head.eyebrow}
            </span>
            <Title className="sg__title" id={isPage ? 'services-page-title' : 'services-title'}>
              {head.title}
            </Title>
            <p className="sg__lead">{head.lead}</p>
          </Reveal>
        </header>

        {/* six black-marble emblem cards — two per row */}
        <div className="sg__grid" role="list">
          {services.map((service, i) => {
            const dim = SYMBOL_DIMS[service.symbol]
            return (
              <Reveal key={service.slug} delay={delayFor(i)} className="sg__cell">
                <Link
                  to={`/services#${service.slug}`}
                  className="sg-card"
                  role="listitem"
                  onPointerMove={trackCard}
                  onPointerLeave={resetCard}
                >
                  <span className="sg-card__halo" aria-hidden="true" />
                  <figure className="sg-card__figure" aria-hidden="true">
                    <img
                      src={`/images/symbol-${service.symbol}-384.webp`}
                      srcSet={`/images/symbol-${service.symbol}-384.webp 384w, /images/symbol-${service.symbol}-640.webp 640w`}
                      sizes="(max-width: 48rem) 38vw, (max-width: 90rem) 22vw, 15rem"
                      width={dim.w}
                      height={dim.h}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="sg-card__base" />
                  </figure>
                  <span className="sg-card__latin" lang="en" translate="no">
                    {service.latin}
                  </span>
                  <CardTitle className="sg-card__title">{service.title}</CardTitle>
                  <p className="sg-card__text">{service.summary}</p>
                  <span className="sg-card__cta">
                    {cardCta}
                    <ArrowLeft size={14} aria-hidden="true" />
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </div>

        {/* on /services each detail article carries its own CTA — the gallery-level
            button only renders on the homepage */}
        {!isPage ? (
          <Reveal className="sg__cta">
            <Button to={ctaLink.to}>{ctaLink.label}</Button>
          </Reveal>
        ) : null}
      </div>
    </section>
  )
}
