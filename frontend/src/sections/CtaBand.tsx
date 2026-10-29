import { Button } from '../components/Button'
import { Reveal } from '../components/Reveal'
import { cta, contact } from '../content/lawyers.fa.js'

export function CtaBand() {
  return (
    <section className="cta-band band band--white" id="consult" aria-labelledby="cta-band-title">
      <div className="container cta-band__grid">
        <Reveal>
          <div className="cta-band__copy">
            <span className="chapter-head__eyebrow">
              <span className="chapter-head__no" aria-hidden="true">
                ۰۵
              </span>
              گام بعدی
            </span>
            <h2 id="cta-band-title" className="cta-band__title">
              مسیر قانونی خود را با اطمینان آغاز کنید
            </h2>
            <p className="cta-band__text">
              در یک جلسه مشاوره، وضعیت حقوقی و گزینه‌های پیش روی شما به‌طور
              شفاف بررسی می‌شود.
            </p>
          </div>
        </Reveal>
        <Reveal delay={110}>
          <div className="cta-band__side">
            <Button to={cta.primary.to}>{cta.primary.label}</Button>
            <span className="cta-band__hint">دفتر {contact.city} — بدون تعهد اولیه</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
