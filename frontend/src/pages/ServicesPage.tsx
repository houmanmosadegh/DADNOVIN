import { Link } from 'react-router-dom'
import { Reveal } from '../components/Reveal'
import { SectionWave } from '../components/SectionWave'
import { ServicesGallery } from '../components/ServicesGallery'
import { consultationPage, services, servicesPage } from '../content/lawyers.fa.js'
import { useSeo } from '../utils/seo'
import './pages.css'

export function ServicesPage() {
  useSeo('services', '/services')
  const L = servicesPage.labels
  return (
    <div className="page">
      {/* gallery head — مشکی (مجسمه روی زمینهٔ تیره می‌نشینه) */}
      <div className="page-band band band--ink">
        <ServicesGallery variant="page" />
      </div>
      <SectionWave from="ink" to="white" />

      {/* per-service detail — the #slug anchors the gallery cards point to — سفید */}
      <div className="page-band band band--white">
        <section className="container svc-list" aria-label={servicesPage.title}>
          {services.map((service, i) => (
            <Reveal key={service.slug} delay={(i % 2) * 80}>
              <article className="svc" id={service.slug}>
                <header className="svc__head">
                  <span className="svc__latin" lang="en" translate="no">
                    {service.latin}
                  </span>
                  <h2 className="svc__title">{service.title}</h2>
                  <p className="svc__details">{service.details}</p>
                  <p className="svc__example">{service.example}</p>
                </header>

                <div className="svc__grid">
                  <div className="svc__col">
                    <span className="svc__label">{L.problem}</span>
                    <p className="svc__text">{service.problem}</p>
                    <span className="svc__label">{L.audience}</span>
                    <p className="svc__text">{service.audience}</p>
                  </div>
                  <div className="svc__col">
                    <span className="svc__label">{L.scope}</span>
                    <ul className="svc__scope">
                      {service.scope.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <footer className="svc__foot">
                  <div className="svc__related">
                    <span className="svc__label svc__label--inline">{L.related}</span>
                    {service.related.map((slug) => {
                      const rel = services.find((s) => s.slug === slug)
                      return rel ? (
                        <Link key={slug} className="svc__chip" to={`/services#${slug}`}>
                          {rel.title}
                        </Link>
                      ) : null
                    })}
                  </div>
                  <Link className="btn btn--ghost svc__cta" to={`/consultation?service=${service.slug}`}>
                    {servicesPage.detailCta}
                  </Link>
                </footer>
              </article>
            </Reveal>
          ))}
        </section>
      </div>
      <SectionWave from="white" to="cream" flip />

      {/* «چطور کار می‌کنیم» + note — استخونی */}
      <div className="page-band band band--cream">
        <div className="container">
          <Reveal>
            <h2 className="how-strip__heading">{servicesPage.stepsTitle}</h2>
            <ol className="how-strip" role="list">
              {consultationPage.steps.map((step, i) => (
                <li key={step.title} className="how-strip__item">
                  <span className="how-strip__no" aria-hidden="true">
                    {new Intl.NumberFormat('fa-IR').format(i + 1)}
                  </span>
                  <div>
                    <h3 className="how-strip__title">{step.title}</h3>
                    <p className="how-strip__text">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal>
            <p className="page__note">
              اگر موضوع شما دقیقاً در یکی از این حوزه‌ها نمی‌گنجد، در{' '}
              <Link to="/contact" className="service-detail__link">
                صفحه تماس
              </Link>{' '}
              عنوان آن را با ما در میان بگذارید.
            </p>
          </Reveal>
        </div>
      </div>
      <SectionWave from="cream" to="goldwhite" />
    </div>
  )
}
