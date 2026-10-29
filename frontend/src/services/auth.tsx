/**
 * Public account auth — cookie session via the same backend mechanism the
 * admin uses. `me` is null for guests; the header renders login/panel
 * accordingly.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { api } from './api'

export interface AccountMe {
  id: string
  full_name: string
  phone: string
  roles: string[]
  is_marketer: boolean
  ref_code: string
  marketer_status: string
  created_at?: string
}

interface AuthState {
  me: AccountMe | null
  loading: boolean
  refresh: () => Promise<void>
  login: (identifier: string, password: string) => Promise<AccountMe>
  register: (input: {
    full_name: string
    phone: string
    password: string
    ref_code: string
  }) => Promise<AccountMe>
  logout: () => Promise<void>
}

const AuthCtx = createContext<AuthState>({
  me: null,
  loading: true,
  refresh: async () => {},
  login: async () => ({}) as AccountMe,
  register: async () => ({}) as AccountMe,
  logout: async () => {},
})

export function useAuth() {
  return useContext(AuthCtx)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AccountMe | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      setMe(await api.get<AccountMe>('/account/me'))
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback(async (identifier: string, password: string) => {
    const out = await api.post<AccountMe>('/account-auth/login', { identifier, password })
    setMe(out)
    return out
  }, [])

  const register = useCallback(
    async (input: { full_name: string; phone: string; password: string; ref_code: string }) => {
      const out = await api.post<AccountMe>('/account-auth/register', input)
      setMe(out)
      return out
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout', {})
    } finally {
      setMe(null)
    }
  }, [])

  return (
    <AuthCtx.Provider value={{ me, loading, refresh, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  )
}
