/**
 * Public API client — base URL comes from VITE_API_URL (empty ⇒ same origin).
 * All calls send `X-Requested-With: fetch` for the backend CSRF guard.
 */

const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const BASE = `${API_ORIGIN}/api/v1`

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'fetch',
      ...init.headers,
    },
    ...init,
  })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const detail = (body as { detail?: { message?: string } | string })?.detail
    const msg =
      typeof detail === 'object' && detail
        ? (detail.message ?? 'خطای سرور')
        : typeof detail === 'string'
          ? detail
          : 'خطای سرور'
    throw new ApiError(res.status, msg)
  }
  return body as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body: unknown, signal?: AbortSignal) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body), signal }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/** Absolute URL for API-hosted assets (media files) — handles cross-origin dev. */
export function apiAsset(path: string): string {
  if (!path) return path
  if (path.startsWith('http') || !API_ORIGIN) return path
  return `${API_ORIGIN}${path}`
}
