import { Award, Landmark, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ResumeCard } from '../components/ResumeCard'
import { Reveal } from '../components/Reveal'
import { aboutPage, lawyers } from '../content/lawyers.fa.js'
import { useSeo } from '../utils/seo'
import './pages.css'

const TRUST_ICONS: Record<string, LucideIcon> = {
  scale: Scale,
  landmark: Landmark,
  'shield-check': ShieldCheck,
  award: Award,
}

export function AboutPage() {
  useSeo('about', '/about')
  return (
    <div className="page">
      <div className="container">
        {/* هیرو — عنوان + شعار با خط‌های طلایی دو سو */}
        <Reveal>
          <header className="page__head">
            <h1 className="page__title">{aboutPage.title}</h1>
            <p className="page__lead">{aboutPage.lead}</p>
            <p className="about-hero__motto">
              <span className="about-hero__rule" aria-hidden="true" />
              {aboutPage.tagline}
              <span className="about-hero__rule" aria-hidden="true" />
            </p>
          </header>
        </Reveal>

        <Reveal delay={80}>
          <div className="page__body">
            {aboutPage.paragraphs.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </Reveal>

        {/* کارت‌های رزومهٔ اعضا — دو ستونه، هم‌قد */}
        <section className="page__block" aria-labelledby="about-members">
          <Reveal>
            <h2 id="about-members" className="page__subtitle">
              {aboutPage.membersTitle}
            </h2>
          </Reveal>
          <div className="members-grid">
            {lawyers.map((lawyer, i) => (
              <Reveal key={lawyer.id} delay={i * 130} style={{ height: '100%' }}>
                <ResumeCard lawyer={lawyer} />
              </Reveal>
            ))}
          </div>
        </section>

        {/* نشانه‌های اعتماد */}
        <section className="page__block" aria-label={aboutPage.trustTitle}>
          <ul className="trust" role="list">
            {aboutPage.trust.map((item, i) => {
              const Icon = TRUST_ICONS[item.icon] ?? ShieldCheck
              return (
                <li key={item.title}>
                  <Reveal delay={i * 90} style={{ height: '100%' }}>
                    <div className="trust__item">
                      <span className="trust__icon" aria-hidden="true">
                        <Icon size={21} strokeWidth={1.6} />
                      </span>
                      <h3 className="trust__title">{item.title}</h3>
                      <p className="trust__text">{item.text}</p>
                    </div>
                  </Reveal>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </div>
  )
}
