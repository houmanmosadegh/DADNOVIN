import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { SectionWave } from '../components/SectionWave'
import { articlesPage as T } from '../content/lawyers.fa.js'
import { api } from '../services/api'
import { applySeo } from '../utils/seo'
import { fmtDate, type ArticleItem } from './ArticlesPage'
import './pages.css'
import './ArticlesPage.css'

interface ArticleDetail extends ArticleItem {
  body: string
  seo_title: string
  seo_description: string
}

/** Single article view — meta comes from the article's own SEO fields. */
export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [article, setArticle] = useState<ArticleDetail | null>(null)

  useEffect(() => {
    if (!slug) return
    const ctl = new AbortController()
    api
      .get<ArticleDetail>(`/public/articles/${encodeURIComponent(slug)}`, ctl.signal)
      .then((a) => {
        setArticle(a)
        setState('ok')
      })
      .catch(() => setState('missing'))
    return () => ctl.abort()
  }, [slug])

  useEffect(() => {
    if (!article) return
    applySeo(
      article.seo_title || `${article.title} | گروه حقوقی دادنوین`,
      article.seo_description || article.excerpt,
      `/articles/${article.slug}`,
    )
  }, [article])

  if (state === 'missing') return <Navigate to="/articles" replace />
  if (!article) return null

  return (
    <div className="page">
      <div className="page-band band band--white">
        <div className="container">
          <article className="article">
            <header className="article__head">
              <Link to="/articles" className="article__back">
                <ArrowRight size={15} aria-hidden="true" />
                {T.back}
              </Link>
              <h1 className="page__title">{article.title}</h1>
              {article.published_at ? (
                <time className="article__date" dateTime={article.published_at}>
                  {fmtDate(article.published_at)}
                </time>
              ) : null}
            </header>
            <div className="article__body">
              {article.body
                .split(/\n{2,}/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </article>
        </div>
      </div>
      <SectionWave from="white" to="goldwhite" />
    </div>
  )
}
