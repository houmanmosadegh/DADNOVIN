import { SectionHeading } from '../components/SectionHeading'
import { Reveal } from '../components/Reveal'
import { LawyerCard } from '../components/LawyerCard'
import { home, lawyers } from '../content/lawyers.fa.js'

export function LawyersSection() {
  return (
    <section className="section lawyers" id="team" aria-labelledby="lawyers-title">
      <div className="container">
        <Reveal>
          <SectionHeading
            index={4}
            eyebrow={home.lawyers.eyebrow}
            title={home.lawyers.title}
            id="lawyers-title"
            lead={home.lawyers.lead}
          />
        </Reveal>

        <div className="lawyers__list">
          {lawyers.map((lawyer, i) => (
            <Reveal key={lawyer.id} variant={i % 2 === 0 ? 'x-start' : 'x-end'}>
              <LawyerCard
                name={lawyer.name}
                title={lawyer.title}
                portrait={lawyer.portrait}
                specialties={lawyer.specialties}
                bio={lawyer.bio}
                flip={i % 2 === 1}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
