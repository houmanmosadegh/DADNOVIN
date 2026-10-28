import {
  FileText,
  GraduationCap,
  Landmark,
  Mail,
  Phone,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { brand, aboutPage } from '../content/lawyers.fa.js'
import './ResumeCard.css'

const ICONS: Record<string, LucideIcon> = {
  scale: Scale,
  landmark: Landmark,
  'shield-check': ShieldCheck,
  'file-text': FileText,
}

interface ResumeLawyer {
  name: string
  bio: string
  portrait?: string | null
  resume: {
    role: string
    nameEn: string
    degree: string
    motto: string
    highlights: { icon: string; title: string; text: string }[]
    expertiseTitle: string
    expertise: string[]
    educationTitle: string
    education: string[]
    phone: string
    email: string | null
  }
}

/**
 * Resume-style member card — charcoal marble panel, hairline gold, portrait
 * column. Every block stays visible (no accordion).
 */
export function ResumeCard({ lawyer }: { lawyer: ResumeLawyer }) {
  const r = lawyer.resume
  return (
    <article className="rcard">

      <div className="rcard__top">
        <div className="rcard__id">
          <p className="rcard__kicker">{r.role}</p>
          <h3 className="rcard__name">{lawyer.name}</h3>
          <p className="rcard__en" lang="en" dir="ltr" translate="no">
            {r.nameEn}
          </p>
          <p className="rcard__degree">{r.degree}</p>
          <p className="rcard__bio">{lawyer.bio}</p>
          <p className="rcard__motto">«{r.motto}»</p>
        </div>
        <figure className={`rcard__portrait${lawyer.portrait ? '' : ' rcard__portrait--ph'}`}>
          {lawyer.portrait ? (
            <img
              src={lawyer.portrait}
              srcSet={lawyer.portrait.replace('-720.webp', '-440.webp') + ' 440w, ' + lawyer.portrait + ' 720w'}
              sizes="(max-width: 48rem) 86vw, 22rem"
              alt={`پرتره ${lawyer.name}`}
              width="720"
              height="720"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="rcard__ph" aria-hidden="true">
              <img src={brand.logoMark} alt="" width="256" height="195" loading="lazy" />
            </span>
          )}
        </figure>
      </div>

      <ul className="rcard__stats" role="list">
        {r.highlights.map((h) => {
          const Icon = ICONS[h.icon] ?? ShieldCheck
          return (
            <li key={h.title} className="rcard__stat">
              <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
              <span className="rcard__stat-title">{h.title}</span>
              <span className="rcard__stat-text">{h.text}</span>
            </li>
          )
        })}
      </ul>

      <section className="rcard__sec" aria-label={r.expertiseTitle}>
        <h4 className="rcard__sec-title">
          <span>{r.expertiseTitle}</span>
        </h4>
        <ul className="rcard__cols" role="list">
          {r.expertise.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="rcard__sec rcard__edu" aria-label={r.educationTitle}>
        <h4 className="rcard__sec-title">
          <GraduationCap size={17} strokeWidth={1.6} aria-hidden="true" />
          <span>{r.educationTitle}</span>
        </h4>
        <ul className="rcard__edu-list" role="list">
          {r.education.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <footer className="rcard__foot">
        <Link className="btn btn--ghost rcard__cta" to="/consultation">
          {aboutPage.cardCta}
        </Link>
        <div className="rcard__contact">
          <a className="rcard__line" href={`tel:${r.phone}`}>
            <Phone size={15} aria-hidden="true" />
            <span dir="ltr">{r.phone}</span>
          </a>
          {r.email ? (
            <a className="rcard__line" href={`mailto:${r.email}`}>
              <Mail size={15} aria-hidden="true" />
              <span dir="ltr">{r.email}</span>
            </a>
          ) : null}
        </div>
      </footer>
    </article>
  )
}
