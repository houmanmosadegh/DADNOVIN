import { Button } from '../components/Button'
import { Reveal } from '../components/Reveal'
import { SectionHeading } from '../components/SectionHeading'
import { cta, contact, home } from '../content/lawyers.fa.js'

export function CtaBand() {
  const { ctaBand } = home
  return (
    <section className="cta-band" id="consult" aria-labelledby="cta-band-title">
      <div className="container cta-band__grid">
        <Reveal>
          <div className="cta-band__copy">
            <SectionHeading
              index={5}
              eyebrow={ctaBand.eyebrow}
              title={ctaBand.title}
              id="cta-band-title"
              lead={ctaBand.text}
            />
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="cta-band__side">
            <Button to={cta.primary.to}>{cta.primary.label}</Button>
            <span className="cta-band__hint">
              دفتر {contact.city} — {ctaBand.hint}
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
