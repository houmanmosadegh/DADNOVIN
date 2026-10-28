import { Mail, MapPin, Phone } from 'lucide-react'
import { ContactForm } from '../components/ContactForm'
import { Reveal } from '../components/Reveal'
import { brand, contact, contactPage, lawyers } from '../content/lawyers.fa.js'
import { useSeo } from '../utils/seo'
import './pages.css'

export function ContactPage() {
  useSeo('contact', '/contact')
  const people = lawyers.filter((l) => l.resume.phone)
  const address = contact.address ?? `ایران، استان خراسان رضوی، ${contact.city}`
  return (
    <div className="page">
      <div className="container">
        <Reveal>
          <header className="page__head">
            <h1 className="page__title">{contactPage.title}</h1>
            <p className="page__lead">{contactPage.lead}</p>
          </header>
        </Reveal>

        {people.length || contact.email ? (
          <Reveal delay={120}>
            <div className="consult-layout contact-layout">
              {/* channel rail — phones, email, city, writing tips */}
              <aside className="consult-aside" aria-label={contactPage.locationLabel}>
                <p className="consult-aside__brand">
                  <img src={brand.logoMark} alt="" width="256" height="195" loading="lazy" />
                  <span>{brand.nameEn}</span>
                </p>
                <h2 className="consult-aside__title">{contactPage.channelsTitle}</h2>
                <ul className="consult-aside__list" role="list">
                  {people.map((l) => (
                    <li key={l.id}>
                      <a className="consult-aside__row" href={`tel:${l.resume.phone}`}>
                        <span className="consult-aside__icon" aria-hidden="true">
                          <Phone size={18} />
                        </span>
                        <span className="consult-aside__meta">
                          <span className="consult-aside__who">{l.name}</span>
                          <span className="consult-aside__what">{l.title}</span>
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
                          <span className="consult-aside__who">{contactPage.emailLabel}</span>
                          <span className="consult-aside__what" dir="ltr">
                            {contact.email}
                          </span>
                        </span>
                      </a>
                    </li>
                  ) : null}
                  <li>
                    <div className="consult-aside__row consult-aside__row--static">
                      <span className="consult-aside__icon" aria-hidden="true">
                        <MapPin size={18} />
                      </span>
                      <span className="consult-aside__meta">
                        <span className="consult-aside__who">{contactPage.locationLabel}</span>
                        <span className="consult-aside__what">{address}</span>
                      </span>
                    </div>
                  </li>
                </ul>

                <h3 className="consult-aside__subtitle">{contactPage.guide.title}</h3>
                <ul className="consult-aside__tips" role="list">
                  {contactPage.guide.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="consult-aside__privacy">{contactPage.form.privacy}</p>
              </aside>

              <div className="consult-form-wrap contact-panel">
                <h2 className="consult-form-wrap__title">{contactPage.form.title}</h2>
                <p className="consult-form-wrap__lead">{contactPage.form.lead}</p>
                <ContactForm />
              </div>
            </div>
          </Reveal>
        ) : (
          <p className="page__note">
            شماره‌های تماس گروه حقوقی دادنوین به‌زودی در همین صفحه اعلام می‌شود.
          </p>
        )}
      </div>
    </div>
  )
}
