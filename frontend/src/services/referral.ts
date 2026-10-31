/** Referral capture — `?ref=CODE` lands a click record + `dn_ref` cookie. */

import { api } from './api'

export const REF_COOKIE = 'dn_ref'
const REF_STASH = 'dn_ref_ui'

/** dn_ref is HttpOnly (server-side source of truth) — JS can't read it.
 *  For form prefill we keep a copy in sessionStorage; backend attribution
 *  always falls back to the real cookie anyway. */
export function readRefCookie(): string {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(REF_STASH) ?? ''
}

/** Call once on app mount.
 *  `?ref=CODE` (organic share link) → record click + stash for prefill.
 *  `?refui=CODE` (set by the /r/ redirect after it already recorded the
 *  click) → stash only, never double-count. */
export function captureReferral(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const ref = params.get('ref')?.trim().toUpperCase()
  const refui = params.get('refui')?.trim().toUpperCase()
  if (refui && !ref) {
    window.sessionStorage.setItem(REF_STASH, refui)
    return
  }
  if (!ref) return
  window.sessionStorage.setItem(REF_STASH, ref)
  void api.post('/referrals/click', { code: ref, path: window.location.pathname }).catch(() => {})
}
