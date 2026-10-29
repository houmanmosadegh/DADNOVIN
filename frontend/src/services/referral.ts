/** Referral capture — `?ref=CODE` lands a click record + `dn_ref` cookie. */

import { api } from './api'

export const REF_COOKIE = 'dn_ref'

export function readRefCookie(): string {
  if (typeof document === 'undefined') return '' // SSR/prerender has no cookies
  const m = document.cookie.match(new RegExp(`(?:^|; )${REF_COOKIE}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : ''
}

/** Call once on app mount — records the landing click and lets the
 *  backend set the cookie with the admin-configured TTL. */
export function captureReferral(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  const code = params.get('ref')?.trim().toUpperCase()
  if (!code) return
  void api.post('/referrals/click', { code, path: window.location.pathname }).catch(() => {})
}
