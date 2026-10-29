import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Reveal } from '../components/Reveal'
import { home } from '../content/lawyers.fa.js'

const { picture } = home

export function PictureSection() {
  return (
    <section
      className="section picture band band--navy"
      id="approach"
      aria-labelledby="picture-title"
    >
      <div className="container picture__grid">
        {/* media column — در دسکتاپ سمت راست، از سمت راست وارد می‌شود */}
        <Reveal variant="x-start" className="picture__media">
          <figure className="picture__frame">
            <picture>
              <source
                type="image/webp"
                srcSet="/images/picture-480.webp 480w, /images/picture-800.webp 800w, /images/picture-1079.webp 1079w"
                sizes="(max-width: 56rem) 80vw, 36vw"
              />
              <img
                src="/images/picture-800.png"
                srcSet="/images/picture-480.png 480w, /images/picture-800.png 800w, /images/picture-1079.png 1079w"
                sizes="(max-width: 56rem) 80vw, 36vw"
                width="1079"
                height="1225"
                loading="lazy"
                decoding="async"
                alt={picture.imageAlt}
              />
            </picture>
          </figure>
        </Reveal>

        {/* text column — از سمت چپ (مقابل تصویر) وارد می‌شود */}
        <Reveal variant="x-end" className="picture__text">
          <div className="picture__copy">
            <span className="chapter-head__eyebrow">
              <span className="chapter-head__no" aria-hidden="true">
                ۰۲
              </span>
              {picture.eyebrow}
            </span>
            <h2 id="picture-title" className="picture__title">
              {picture.title}
            </h2>
            <p className="picture__lead">{picture.text}</p>
            <Link to={picture.link.to} className="picture__link">
              {picture.link.label}
              <ArrowLeft size={17} aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
