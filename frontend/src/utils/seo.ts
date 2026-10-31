import { useEffect } from 'react'
import { seo, siteUrl } from '../content/lawyers.fa.js'

export type SeoPage = keyof typeof seo

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  )
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.content = content
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )
  if (!el) {
    el = document.createElement('link')
    el.rel = 'canonical'
    document.head.appendChild(el)
  }
  el.href = href
}

export function canonicalFor(path: string): string {
  return `${siteUrl}${path === '/' ? '/' : path}`
}

/**
 * Syncs <title>, meta description, canonical and OG/Twitter tags for the
 * current route. Crawlers also get the same values in prerendered HTML.
 */
export function useSeo(page: SeoPage, path: string) {
  useEffect(() => {
    const meta = seo[page]
    applySeo(meta.title, meta.description, path)
  }, [page, path])
}

/** Dynamic variant — e.g. article pages whose meta comes from the API. */
export function applySeo(title: string, description: string, path: string) {
  const url = canonicalFor(path)
  document.title = title
  setMeta('name', 'description', description)
  setCanonical(url)
  setMeta('property', 'og:title', title)
  setMeta('property', 'og:description', description)
  setMeta('property', 'og:url', url)
  setMeta('name', 'twitter:title', title)
  setMeta('name', 'twitter:description', description)
}
