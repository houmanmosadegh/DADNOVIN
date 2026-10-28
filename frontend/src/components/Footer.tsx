import { Link } from 'react-router-dom'
import { Mail, MapPin, Phone } from 'lucide-react'
import { brand, contact, nav, services } from '../content/lawyers.fa.js'
import './Footer.css'

const jalaliYear = new Intl.DateTimeFormat('fa-IR', { year: 'numeric' }).format(
  new Date(),
)

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <Link to="/" className="brand" aria-label={brand.legalName}>
            <span className="brand__seal">
              <img src={brand.logoMark} alt="" width="42" height="33" loading="lazy" decoding="async" />
            </span>
            <span className="brand__text">
              <span className="brand__name">{brand.legalName}</span>
              <span className="brand__en" lang="en" translate="no">
                {brand.nameEn}
              </span>
            </span>
          </Link>
          <p className="site-footer__desc">{brand.description}</p>
        </div>

        <nav className="site-footer__col" aria-label="دسترسی سریع">
          <h3 className="site-footer__heading">دسترسی سریع</h3>
          <ul role="list">
            {nav.map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="site-footer__link">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="site-footer__col" aria-label="خدمات حقوقی">
          <h3 className="site-footer__heading">خدمات</h3>
          <ul role="list">
            {services.map((s) => (
              <li key={s.slug}>
                <Link to={`/services#${s.slug}`} className="site-footer__link">
                  {s.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-footer__col" aria-label="ارتباط با ما">
          <h3 className="site-footer__heading">ارتباط با ما</h3>
          <ul role="list" className="site-footer__contact">
            {contact.phones.map((phone: string) => (
              <li key={phone}>
                <Phone size={16} aria-hidden="true" />
                <a href={`tel:${phone}`} className="site-footer__link" dir="ltr">
                  {phone}
                </a>
              </li>
            ))}
            <li>
              <MapPin size={16} aria-hidden="true" />
              <span className="site-footer__link">
                {contact.address ?? `ایران، ${contact.city}`}
              </span>
            </li>
            {contact.email ? (
              <li>
                <Mail size={16} aria-hidden="true" />
                <a href={`mailto:${contact.email}`} className="site-footer__link">
                  {contact.email}
                </a>
              </li>
            ) : null}
            {contact.address ? (
              <li>
                <MapPin size={16} aria-hidden="true" />
                <span className="site-footer__link">{contact.address}</span>
              </li>
            ) : null}
            <li>
              <span className="site-footer__note">
                برای هماهنگی مشاوره، از طریق{' '}
                <Link to="/contact" className="site-footer__link site-footer__link--gold">
                  صفحه تماس
                </Link>{' '}
                با ما در ارتباط باشید.
              </span>
            </li>
          </ul>
        </div>
      </div>

      <div className="site-footer__bar">
        <div className="container site-footer__bar-inner">
          <p>© {jalaliYear} {brand.legalName} — تمامی حقوق محفوظ است.</p>
        </div>
      </div>
    </footer>
  )
}
