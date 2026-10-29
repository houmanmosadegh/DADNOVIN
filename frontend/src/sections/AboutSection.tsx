import { BookOpen, Search, ShieldCheck, type LucideIcon } from 'lucide-react'
import { ChapterHead } from '../components/ChapterHead'
import { CountUp } from '../components/CountUp'
import { Reveal } from '../components/Reveal'
import { brand, home, lawyers, services } from '../content/lawyers.fa.js'

const PRINCIPLE_ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  search: Search,
  'shield-check': ShieldCheck,
}

const faNum = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2 })

export function AboutSection() {
  const { about } = home
  return (
    <section className="section about band band--white" id="about" aria-labelledby="about-title">
      <div className="container about__grid">
        <div className="about__side">
          <Reveal>
            <ChapterHead
              index="۰۱"
              eyebrow="گروه حقوقی دادنوین"
              title={about.title}
              id="about-title"
            />
          </Reveal>
          <Reveal delay={90}>
            <div className="about__body">
              {about.paragraphs.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <dl className="about__stats">
              <div className="stat">
                <dd className="stat__num">
                  <CountUp value={lawyers.length} />
                </dd>
                <dt className="stat__label">{home.stats.lawyersSuffix}</dt>
              </div>
              <div className="stat">
                <dd className="stat__num">
                  <CountUp value={services.length} />
                </dd>
                <dt className="stat__label">{home.stats.servicesSuffix}</dt>
              </div>
              <div className="stat">
                <dd className="stat__num stat__num--city">{brand.city}</dd>
                <dt className="stat__label">محل دفتر</dt>
              </div>
            </dl>
          </Reveal>
        </div>

        <ol className="ledger" role="list" aria-label="اصول کاری دادنوین">
          {about.principles.map((item, i) => {
            const Icon = PRINCIPLE_ICONS[item.icon] ?? ShieldCheck
            return (
              <li key={item.title}>
                <Reveal delay={i * 110} variant="x-end">
                  <div className="ledger__row">
                    <span className="ledger__no" aria-hidden="true">
                      {faNum.format(i + 1)}
                    </span>
                    <div className="ledger__main">
                      <h3 className="ledger__title">{item.title}</h3>
                      <p className="ledger__text">{item.text}</p>
                    </div>
                    <span className="ledger__icon" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.7} />
                    </span>
                  </div>
                </Reveal>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
