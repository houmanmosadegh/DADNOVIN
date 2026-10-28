/** 3 → "03" — two-digit Latin chapter number, generated not typed. */
export function chapterIndex(index: number): string {
  return String(Math.max(0, Math.trunc(index))).padStart(2, '0')
}

interface SectionHeadingProps {
  /** chapter order on the page — rendered as a two-digit number */
  index?: number
  eyebrow: string
  title: string
  id?: string
  lead?: string
  /** 'start' (default): number mark beside the title. 'center': centred, for the services gallery. */
  align?: 'start' | 'center'
  /** heading level — inner pages use h1 */
  level?: 1 | 2
}

/**
 * Shared numbered heading for landing sections — identical number size,
 * spacing and alignment everywhere; the number is generated from `index`
 * so chapter order stays honest.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  id,
  lead,
  align = 'start',
  level = 2,
}: SectionHeadingProps) {
  const Tag = level === 1 ? 'h1' : 'h2'
  return (
    <header className={`sec-head${align === 'center' ? ' sec-head--center' : ''}`}>
      <span className="sec-head__eyebrow">{eyebrow}</span>
      {typeof index === 'number' ? (
        <span className="sec-head__mark" aria-hidden="true">
          <span className="sec-head__no">{chapterIndex(index)}</span>
        </span>
      ) : null}
      <Tag className="sec-head__title" id={id}>
        {title}
      </Tag>
      {lead ? <p className="sec-head__lead">{lead}</p> : null}
    </header>
  )
}
