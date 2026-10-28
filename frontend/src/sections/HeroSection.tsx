import { Button } from '../components/Button'
import { Typewriter } from '../components/Typewriter'
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
  return (
    <section className="hero" aria-labelledby="hero-title">
      {/* cinematic hall — Lady-Justice scene covering the whole hero */}
      <div className="hero__bg" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 56rem)"
            type="image/webp"
            srcSet="/images/intro-hall-portrait-560.webp 560w, /images/intro-hall-portrait-900.webp 900w"
            sizes="100vw"
          />
          <source
            type="image/webp"
            srcSet="/images/intro-hall-800.webp 800w, /images/intro-hall-1280.webp 1280w, /images/intro-hall-1672.webp 1672w"
            sizes="100vw"
          />
          <img
            src="/images/intro-hall-1280.jpg"
            srcSet="/images/intro-hall-800.jpg 800w, /images/intro-hall-1280.jpg 1280w, /images/intro-hall-1672.jpg 1672w"
            sizes="100vw"
            width="1672"
            height="941"
            decoding="async"
            alt=""
          />
        </picture>
        <span className="hero__bg-scrim" />
      </div>

      <div className="container hero__inner">
        <div className="hero__copy">
          <p className="hero__eyebrow">
            <span className="hero__eyebrow-line" aria-hidden="true" />
            {brand.legalName} — {brand.city}
          </p>
          <p className="hero__motto">
            <Typewriter text={brand.tagline} speed={60} />
          </p>
          <h1 id="hero-title" className="hero__title">
            <AccentTitle text={home.hero.title} accent={home.hero.titleAccent} />
          </h1>
          <p className="hero__subtitle">{home.hero.subtitle}</p>
          <div className="hero__ctas">
            <Button to={cta.secondary.to} variant="ghost">
              {cta.secondary.label}
            </Button>
            <Button to={cta.primary.to}>{cta.primary.label}</Button>
          </div>
          <dl className="hero__meta">
            <div className="hero__meta-item">
              <dt className="sr-only">تعداد وکلا</dt>
              <dd>
                {faNum.format(lawyers.length)} {home.stats.lawyersSuffix}
              </dd>
            </div>
            <div className="hero__meta-item">
              <dt className="sr-only">حوزه‌های خدمات</dt>
              <dd>
                {faNum.format(services.length)} {home.stats.servicesSuffix}
              </dd>
            </div>
            <div className="hero__meta-item">
              <dt className="sr-only">شهر</dt>
              <dd>{brand.city}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  )
}
