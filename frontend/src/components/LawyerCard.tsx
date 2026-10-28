import { useState } from 'react'

export interface LawyerCardProps {
  name: string
  title: string
  portrait?: string | null
  specialties: string[]
  bio: string
  /** نمایش چینش آینه‌ای — برای ردیف دوم به بعد */
  flip?: boolean
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 1)
  return parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)
}

/** Editorial lawyer row — media block overlapping a text column. */
export function LawyerCard({
  name,
  title,
  portrait,
  specialties,
  bio,
  flip = false,
}: LawyerCardProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = Boolean(portrait) && !imgFailed

  return (
    <article className={`lawyer${flip ? ' lawyer--flip' : ''}`}>
      <div className="lawyer__media">
        {showImage ? (
          <img
            src={portrait as string}
            srcSet={`${(portrait as string).replace('-720.webp', '-440.webp')} 440w, ${portrait} 720w`}
            sizes="(max-width: 56rem) 19rem, 16.5rem"
            alt={`پرتره ${name}`}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="lawyer__placeholder" role="img" aria-label={`تصویر ${name} به‌زودی`}>
            <span className="lawyer__initials" aria-hidden="true">
              {initialsOf(name)}
            </span>
          </div>
        )}
      </div>
      <div className="lawyer__body">
        <h3 className="lawyer__name">{name}</h3>
        <p className="lawyer__title">{title}</p>
        <p className="lawyer__bio">{bio}</p>
        <p className="lawyer__specs">
          <span className="lawyer__specs-label">حوزه‌های تمرکز</span>
          {specialties.join(' · ')}
        </p>
      </div>
    </article>
  )
}
