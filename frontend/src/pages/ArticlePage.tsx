import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowRight, Clock, Tag } from 'lucide-react'
import { SectionWave } from '../components/SectionWave'
import { articlesPage as T, brand, siteUrl } from '../content/lawyers.fa.js'
import { api, apiAsset } from '../services/api'
import { applySeo, canonicalFor } from '../utils/seo'
import { fmtDate, type ArticleItem } from './ArticlesPage'
import './pages.css'
import './ArticlesPage.css'

interface ArticleDetail extends ArticleItem {
  body: string
  seo_title: string
  seo_description: string
  canonical: string
  author_bio: string
}

interface TocItem {
  id: string
  text: string
  level: number
}

function setJsonLd(id: string, data: unknown) {
  let el = document.head.querySelector<HTMLScriptElement>(`script[data-ld="${id}"]`)
  if (!el) {
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.setAttribute('data-ld', id)
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(data)
}

/** Single article view — meta comes from the article's own SEO fields. */
export function ArticlePage() {
  const { slug } = useParams<{ slug: string }>()
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading')
  const [article, setArticle] = useState<ArticleDetail | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

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
      `/articles/${article.slug}`
    )
    // canonical override — only when the article declares one explicitly
    if (article.canonical) {
      const el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
      if (el) el.href = article.canonical
    }
    // Article + BreadcrumbList structured data
    const url = canonicalFor(`/articles/${article.slug}`)
    setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.seo_title || article.title,
      description: article.seo_description || article.excerpt,
      inLanguage: 'fa-IR',
      mainEntityOfPage: url,
      ...(article.published_at ? { datePublished: article.published_at } : {}),
      ...(article.author_name ? { author: { '@type': 'Person', name: article.author_name } } : {}),
      ...(article.category ? { articleSection: article.category } : {}),
      publisher: {
        '@type': 'Organization',
        name: brand.name,
        logo: { '@type': 'ImageObject', url: `${siteUrl}${brand.logoMark}` },
      },
    })
    setJsonLd('article-bc', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'خانه', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: 'مقالات', item: `${siteUrl}/articles` },
        { '@type': 'ListItem', position: 3, name: article.title, item: url },
      ],
    })
    return () => {
      document.head.querySelector('script[data-ld="article"]')?.remove()
      document.head.querySelector('script[data-ld="article-bc"]')?.remove()
    }
  }, [article])

  // فهرست مطالب — از تیترهای h2/h3 متن رندرشده
  const toc = useMemo<TocItem[]>(() => {
    if (!article?.body) return []
    const doc = new DOMParser().parseFromString(article.body, 'text/html')
    const heads = [...doc.querySelectorAll('h2, h3')]
    return heads.map((h, i) => ({
      id: `sec-${i}`,
      text: h.textContent?.trim() ?? '',
      level: h.tagName === 'H2' ? 2 : 3,
    }))
  }, [article?.body])

  useEffect(() => {
    if (!bodyRef.current || !toc.length) return
    const heads = bodyRef.current.querySelectorAll('h2, h3')
    heads.forEach((h, i) => {
      if (toc[i]) h.id = toc[i].id
    })
  }, [toc, article])

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
              {article.category ? <span className="article__cat">{article.category}</span> : null}
              <h1 className="page__title">{article.title}</h1>
              <div className="article__meta">
                {article.published_at ? (
                  <time className="article__date" dateTime={article.published_at}>
                    {fmtDate(article.published_at)}
                  </time>
                ) : null}
                {article.read_time_min ? (
                  <span className="article__readtime">
                    <Clock size={13} aria-hidden="true" />
                    {article.read_time_min} دقیقه مطالعه
                  </span>
                ) : null}
                {article.author_name ? <span className="article__author">{article.author_name}</span> : null}
              </div>
              {article.featured_image ? (
                <img
                  className="article__hero"
                  src={apiAsset(`/api/v1/media/${article.featured_image}`)}
                  alt={article.title}
                  loading="eager"
                  decoding="async"
                />
              ) : null}
            </header>

            {toc.length > 1 ? (
              <nav className="article__toc" aria-label="فهرست مطالب">
                <p className="article__toc-title">در این مقاله</p>
                <ul>
                  {toc.map((t) => (
                    <li key={t.id} className={t.level === 3 ? 'is-sub' : ''}>
                      <a href={`#${t.id}`}>{t.text}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            <div
              ref={bodyRef}
              className="article__body article__body--rich"
              dangerouslySetInnerHTML={{ __html: article.body }}
            />

            {article.tags?.length ? (
              <ul className="article__tags" aria-label="برچسب‌ها">
                {article.tags.map((t) => (
                  <li key={t}>
                    <Tag size={12} aria-hidden="true" />
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}

            {article.author_name ? (
              <footer className="article__byline">
                <p className="article__byline-name">{article.author_name}</p>
                {article.author_bio ? <p className="article__byline-bio">{article.author_bio}</p> : null}
              </footer>
            ) : null}
          </article>
        </div>
      </div>
      <SectionWave from="white" to="goldwhite" />
    </div>
  )
}
