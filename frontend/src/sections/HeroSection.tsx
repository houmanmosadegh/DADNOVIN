import { useEffect, useRef, useState } from 'react'
import { Button } from '../components/Button'
import { StatueParticles } from '../components/StatueParticles'
import { brand, cta, home, lawyers, services } from '../content/lawyers.fa.js'

const faNum = new Intl.NumberFormat('fa-IR')

/** Splits the hero title around its accent word so the underline can draw in. */
function AccentTitle({ text, accent }: { text: string; accent?: string }) {
  const i = accent ? text.indexOf(accent) : -1
  if (i < 0 || !accent) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <span className="hero__mark">{accent}</span>
      {text.slice(i + accent.length)}
    </>
  )
}

export function HeroSection() {
  const heroRef = useRef<HTMLElement>(null)
  const [statueEl, setStatueEl] = useState<HTMLImageElement | null>(null)
  const [heroEl, setHeroEl] = useState<HTMLElement | null>(null)
  // stage mounts client-side only — keeps it out of prerendered HTML
  const [showStage, setShowStage] = useState(false)

  useEffect(() => {
    setHeroEl(heroRef.current)
    setShowStage(true)
  }, [])

  return (
    <section className="hero band band--ink" ref={heroRef} aria-labelledby="hero-title">
      {/* bronze justice statue — foreground figure standing on the left,
          its WebGL point cloud revealed by cursor and ambient drift */}
      {showStage ? (
        <div className="hero__stage" aria-hidden="true">
          {statueEl && heroEl ? (
            <StatueParticles target={statueEl} host={heroEl} className="hero__points" />
          ) : null}
          <img
            ref={setStatueEl}
            className="hero__statue"
            src="/images/man-legal.webp"
            width="561"
            height="755"
            alt=""
            draggable={false}
            fetchPriority="high"
            decoding="async"
          />
          <span className="hero__statue-shadow" />
        </div>
      ) : null}

      <aside className="hero-panel">
        <div className="hero__copy">
          <h1 id="hero-title" className="hero__title">
            <AccentTitle text={home.hero.title} accent={home.hero.titleAccent} />
          </h1>
          <span className="hero__rule" aria-hidden="true" />
          <p className="hero__hook">{home.hero.hook}</p>
          <p className="hero__subtitle">{home.hero.subtitle}</p>
          <div className="hero__ctas">
            <Button to={cta.primary.to} className="btn-navy">
              {cta.primary.label}
            </Button>
            <Button to={cta.secondary.to} variant="ghost">
              {cta.secondary.label}
            </Button>
          </div>
          <dl className="hero__meta">
            <div className="hero__meta-item">
              <dt className="sr-only">تعداد وکلا</dt>
              <dd>
                <strong>{faNum.format(lawyers.length)}</strong> وکیل و مشاور
              </dd>
            </div>
            <div className="hero__meta-item">
              <dt className="sr-only">حوزه‌های خدمات</dt>
              <dd>
                <strong>{faNum.format(services.length)}</strong> حوزهٔ تخصصی
              </dd>
            </div>
            <div className="hero__meta-item">
              <dt className="sr-only">شهر</dt>
              <dd>{brand.city}</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* hairline of gold riding the hero's wave edge — the hero's own
          mask clips the stroke to the black side, so it reads as a
          thread along the cut, not a line over the panel */}
      <svg className="hero__seam" viewBox="0 0 1440 1000" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 925C45 940 110 944 200 935C300 925 370 944 480 940C590 936 640 917 740 905C880 888 950 937 1080 918C1240 895 1330 940 1440 908" />
      </svg>

      <span className="hero__scroll" aria-hidden="true">
        <span className="hero__scroll-text">اسکرول</span>
        <span className="hero__scroll-line" />
      </span>
    </section>
  )
}
