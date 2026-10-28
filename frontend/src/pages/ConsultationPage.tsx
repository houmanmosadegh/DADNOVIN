import { Mail, Phone } from 'lucide-react'
import { ConsultationForm } from '../components/ConsultationForm'
import { Reveal } from '../components/Reveal'
import { consultationPage, contact, lawyers } from '../content/lawyers.fa.js'
import { useSeo } from '../utils/seo'
import './pages.css'

export function ConsultationPage() {
  useSeo('consultation', '/consultation')
  const people = lawyers.filter((l) => l.resume.phone)
  const F = consultationPage.form
  const points = [consultationPage.forWhom, consultationPage.receive, consultationPage.prepare]
  return (
    <div className="page">
      <div className="container">
        <Reveal>
          <header className="page__head">
            <h1 className="page__title">{consultationPage.title}</h1>
            <p className="page__lead">{consultationPage.lead}</p>
          </header>
        </Reveal>

        {/* for whom / what you get / what to prepare — answers before the ask */}
        <div className="consult-points">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 90}>
              <section className="consult-point">
                <h2 className="consult-point__title">{p.title}</h2>
                <ul className="consult-point__list">
                  {p.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            </Reveal>
          ))}
        </div>

        <ol className="timeline" role="list">
          {consultationPage.steps.map((step, i) => (
            <li key={step.title} className="timeline__item">
              <Reveal delay={i * 110}>
                <span className="timeline__node" aria-hidden="true">
                  {new Intl.NumberFormat('fa-IR').format(i + 1)}
                </span>
                <div className="timeline__body">
                  <h2 className="timeline__title">{step.title}</h2>
                  <p className="timeline__text">{step.text}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        {/* genuine visitor questions — always visible, no accordion */}
        <Reveal delay={100}>
          <section className="faq" aria-labelledby="faq-title">
            <h2 className="faq__title" id="faq-title">
              {consultationPage.faqsTitle}
            </h2>
            <div className="faq__list">
              {consultationPage.faqs.map((f) => (
                <div key={f.q} className="faq__item">
                  <h3 className="faq__q">{f.q}</h3>
                  <p className="faq__a">{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={140}>
          <div className="consult-layout">
            {/* direct-contact rail — premium firm pattern: channels beside the form */}
            <aside className="consult-aside" aria-label={F.direct.title}>
              <h2 className="consult-aside__title">{F.direct.title}</h2>
              <ul className="consult-aside__list" role="list">
                {people.map((l) => (
                  <li key={l.id}>
                    <a className="consult-aside__row" href={`tel:${l.resume.phone}`}>
                      <span className="consult-aside__icon" aria-hidden="true">
                        <Phone size={18} />
                      </span>
                      <span className="consult-aside__meta">
                        <span className="consult-aside__who">{l.name}</span>
                        <span className="consult-aside__what">{F.direct.callLabel}</span>
                      </span>
                      <span className="consult-aside__value" dir="ltr">
                        {l.resume.phone}
                      </span>
                    </a>
                  </li>
                ))}
                {contact.email ? (
                  <li>
                    <a className="consult-aside__row" href={`mailto:${contact.email}`}>
                      <span className="consult-aside__icon" aria-hidden="true">
                        <Mail size={18} />
                      </span>
                      <span className="consult-aside__meta">
                        <span className="consult-aside__who">{F.direct.emailLabel}</span>
                        <span className="consult-aside__what" dir="ltr">{contact.email}</span>
                      </span>
                    </a>
                  </li>
                ) : null}
              </ul>
              <p className="consult-aside__note">{consultationPage.note}</p>
              <p className="consult-aside__privacy">{F.direct.privacy}</p>
            </aside>

            <div className="consult-form-wrap">
              <h2 className="consult-form-wrap__title">{F.title}</h2>
              <p className="consult-form-wrap__lead">{F.lead}</p>
              <ConsultationForm />
            </div>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
