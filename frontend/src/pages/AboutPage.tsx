import { Award, Landmark, Scale, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ResumeCard } from '../components/ResumeCard'
import { Reveal } from '../components/Reveal'
import { SectionWave } from '../components/SectionWave'
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
      {/* head + intro — سفید */}
      <div className="page-band band band--white">
        <div className="container">
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
        </div>
      </div>
      <SectionWave from="white" to="navy" />

      {/* کارت‌های رزومهٔ اعضا — سورمه‌ای */}
      <div className="page-band band band--navy">
        <div className="container">
          <section aria-labelledby="about-members">
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
        </div>
      </div>
      <SectionWave from="navy" to="gray" flip />

      {/* نشانه‌های اعتماد — فیلی */}
      <div className="page-band band band--gray">
        <div className="container">
          <section aria-labelledby="about-trust">
            <ul className="trust" role="list" aria-label="نشانه‌های اعتماد">
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
      <SectionWave from="gray" to="goldwhite" />
    </div>
  )
}
