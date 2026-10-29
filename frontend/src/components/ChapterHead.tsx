interface ChapterHeadProps {
  /** شمارهٔ فصل به‌صورت عدد فارسی، مثل «۰۳» */
  index: string
  eyebrow: string
  title: string
  /** id روی h2 برای aria-labelledby سکشن */
  id?: string
  lead?: string
}

/** Shared chapter header — ghost number + eyebrow + big title. */
export function ChapterHead({ index, eyebrow, title, id, lead }: ChapterHeadProps) {
  return (
    <header className="chapter-head">
      <span className="chapter-head__no" aria-hidden="true">
        {index}
      </span>
      <div className="chapter-head__body">
        <span className="chapter-head__eyebrow">{eyebrow}</span>
        <h2 className="chapter-head__title" id={id}>
          {title}
        </h2>
        {lead ? <p className="chapter-head__lead">{lead}</p> : null}
      </div>
    </header>
  )
}
