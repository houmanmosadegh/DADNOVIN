import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Reveal } from '../components/Reveal'
import { SectionWave } from '../components/SectionWave'
import { articlesPage as T } from '../content/lawyers.fa.js'
import { api } from '../services/api'
import { useSeo } from '../utils/seo'
import './pages.css'
import './ArticlesPage.css'

export interface ArticleItem {
  slug: string
  title: string
  excerpt: string
  published_at: string | null
}

export function fmtDate(iso: string | null) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(
      new Date(iso),
    )
  } catch {
    return ''
  }
}

/** Public articles index — only reachable when a published article exists. */
export function ArticlesPage() {
  useSeo('articles', '/articles')
  const [items, setItems] = useState<ArticleItem[] | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    api
      .get<ArticleItem[]>('/public/articles', ctl.signal)
      .then(setItems)
      .catch(() => setItems([]))
    return () => ctl.abort()
  }, [])

  // روت عمومی نباید صفحهٔ خالی نشان بدهد — بدون مقاله به خانه برمی‌گردیم
  if (items !== null && items.length === 0) return <Navigate to="/" replace />

  return (
    <div className="page">
      <div className="page-band band band--white">
        <div className="container">
          <Reveal>
            <header className="page__head">
              <p className="page__kicker">{T.kicker}</p>
              <h1 className="page__title">{T.title}</h1>
              <p className="page__lead">{T.subtitle}</p>
            </header>
          </Reveal>
        </div>
      </div>
      <SectionWave from="white" to="gray" />

      <div className="page-band band band--gray">
        <div className="container">
          {items === null ? (
            <div className="articles__grid" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="articles__card articles__card--skeleton" />
              ))}
            </div>
          ) : (
            <ul className="articles__grid" role="list">
              {items.map((a, i) => (
                <li key={a.slug}>
                  <Reveal delay={i * 70}>
                    <Link to={`/articles/${a.slug}`} className="articles__card">
                      <h2 className="articles__card-title">{a.title}</h2>
                      {a.excerpt ? (
                        <p className="articles__card-excerpt">{a.excerpt}</p>
                      ) : null}
                      <span className="articles__card-foot">
                        {a.published_at ? (
                          <time dateTime={a.published_at}>
                            {fmtDate(a.published_at)}
                          </time>
                        ) : (
                          <span />
                        )}
                        <span className="articles__card-more">
                          {T.readMore}
                          <ArrowLeft size={15} aria-hidden="true" />
                        </span>
                      </span>
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <SectionWave from="gray" to="goldwhite" />
    </div>
  )
}
