/**
 * Remote content overlay.
 *
 * The JS content module stays the source of truth for structure and as the
 * offline/prerender fallback. When the backend is reachable, this module
 * fetches the public API and applies the returned values IN PLACE onto the
 * exported objects (mutating contents, not bindings) — a single re-render at
 * the app root then picks everything up. If the API is down or incomplete,
 * the static content remains untouched and the site looks exactly as before.
 */

import { api, apiAsset } from '../services/api'
import * as c from './lawyers.fa.js'

type Dict = Record<string, unknown>

interface PublicSettings {
  brand?: Dict
  contact?: Dict
  seo?: Dict
  socials?: Dict
  footer?: Dict
  ai?: Dict
}

interface PublicPage {
  slug: string
  sections: { key: string; content: Dict }[]
}

interface PublicLawyer {
  slug: string
  name: string
  title: string
  bio: string
  specialties: unknown[]
  resume: Dict
  portrait_url: string
  phone: string
  email: string
  sort_order: number
}

/** Feature flags the UI can read (re-render applies them). */
export const siteFlags = {
  aiEnabled: true,
}

function mergeObj(target: Dict, source: Dict) {
  for (const [k, v] of Object.entries(source)) {
    if (v !== undefined && v !== null) target[k] = v
  }
}

function sectionMap(page: PublicPage | undefined): Map<string, Dict> {
  const m = new Map<string, Dict>()
  for (const s of page?.sections ?? []) m.set(s.key, s.content)
  return m
}

function applySettings(s: PublicSettings) {
  if (s.brand) {
    const rest = { ...s.brand }
    delete rest.siteUrl // siteUrl is a const binding — stays code-level
    mergeObj(c.brand as unknown as Dict, rest)
  }
  if (s.contact) {
    const contact = c.contact as unknown as Dict
    const { socials, ...rest } = s.contact
    mergeObj(contact, rest)
    if (Array.isArray(socials)) contact.socials = socials
  }
  if (s.seo) {
    for (const [slug, meta] of Object.entries(s.seo)) {
      const target = (c.seo as unknown as Dict)[slug]
      if (target && typeof meta === 'object') mergeObj(target as Dict, meta as Dict)
    }
  }
  if (s.footer?.description) {
    ;(c.brand as unknown as Dict).description = s.footer.description
  }
  if (s.socials?.items && Array.isArray(s.socials.items)) {
    ;(c.contact as unknown as Dict).socials = s.socials.items
  }
  if (s.ai) {
    siteFlags.aiEnabled = s.ai.enabled !== false
    if (typeof s.ai.welcome === 'string') c.aiConsultant.chat.welcome = s.ai.welcome
    if (typeof s.ai.placeholder === 'string')
      c.aiConsultant.chat.placeholder = s.ai.placeholder
  }
}

function applyPages(pages: PublicPage[]) {
  const bySlug = new Map(pages.map((p) => [p.slug, p]))
  const home = sectionMap(bySlug.get('home'))
  const h = c.home as unknown as Dict
  if (home.has('hero')) mergeObj(h.hero as Dict, home.get('hero')!)
  if (home.has('stats')) mergeObj(h.stats as Dict, home.get('stats')!)
  if (home.has('about')) mergeObj(h.about as Dict, home.get('about')!)
  if (home.has('services_head')) mergeObj(h.services as Dict, home.get('services_head')!)
  if (home.has('picture')) mergeObj(h.picture as Dict, home.get('picture')!)
  if (home.has('lawyers_head')) mergeObj(h.lawyers as Dict, home.get('lawyers_head')!)
  if (home.has('cta_band')) mergeObj(h.ctaBand as Dict, home.get('cta_band')!)

  const about = sectionMap(bySlug.get('about'))
  const ap = c.aboutPage as unknown as Dict
  if (about.has('head')) mergeObj(ap, about.get('head')!)
  if (about.has('paragraphs')) {
    const items = about.get('paragraphs')!.items
    if (Array.isArray(items)) ap.paragraphs = items
  }
  if (about.has('trust')) {
    const items = about.get('trust')!.items
    if (Array.isArray(items)) ap.trust = items
  }

  const services = sectionMap(bySlug.get('services'))
  const sp = c.servicesPage as unknown as Dict
  if (services.has('head')) mergeObj(sp, services.get('head')!)
  if (services.has('items')) {
    const items = services.get('items')!.items
    if (Array.isArray(items) && items.length) {
      c.services.splice(0, c.services.length, ...(items as typeof c.services))
    }
  }

  const consult = sectionMap(bySlug.get('consultation'))
  const cp = c.consultationPage as unknown as Dict
  if (consult.has('head')) mergeObj(cp, consult.get('head')!)
  if (consult.has('for_whom')) mergeObj(cp.forWhom as Dict, consult.get('for_whom')!)
  if (consult.has('receive')) mergeObj(cp.receive as Dict, consult.get('receive')!)
  if (consult.has('prepare')) mergeObj(cp.prepare as Dict, consult.get('prepare')!)
  if (consult.has('faqs')) {
    const f = consult.get('faqs')!
    if (f.title) cp.faqsTitle = f.title
    if (Array.isArray(f.items)) cp.faqs = f.items
  }
  if (consult.has('steps')) {
    const items = consult.get('steps')!.items
    if (Array.isArray(items)) cp.steps = items
  }
  if (consult.has('note')) {
    const text = consult.get('note')!.text
    if (text) cp.note = text
  }

  const contact = sectionMap(bySlug.get('contact'))
  if (contact.has('head')) {
    mergeObj(c.contactPage as unknown as Dict, contact.get('head')!)
  }
}

function applyLawyers(lawyers: PublicLawyer[]) {
  if (!lawyers.length) return
  const mapped = lawyers.map((l) => ({
    id: l.slug,
    name: l.name,
    title: l.title,
    portrait: l.portrait_url ? apiAsset(l.portrait_url) : null,
    specialties: l.specialties,
    bio: l.bio,
    resume: {
      ...(l.resume as Dict),
      phone: l.phone,
      email: l.email || null,
    },
  }))
  c.lawyers.splice(0, c.lawyers.length, ...(mapped as typeof c.lawyers))
}

/**
 * Fetch the public API and apply all overlays.
 * Returns true when remote data was applied (caller should re-render).
 * Any failure leaves static content untouched and resolves false.
 */
export async function loadRemoteContent(): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 4000)
  try {
    const [settings, pages, lawyers] = await Promise.all([
      api.get<PublicSettings>('/public/settings', ctl.signal),
      api.get<PublicPage[]>('/public/pages', ctl.signal),
      api.get<PublicLawyer[]>('/public/lawyers', ctl.signal),
    ])
    try {
      applySettings(settings)
    } catch {
      /* keep static */
    }
    try {
      applyPages(pages)
    } catch {
      /* keep static */
    }
    try {
      applyLawyers(lawyers)
    } catch {
      /* keep static */
    }
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
