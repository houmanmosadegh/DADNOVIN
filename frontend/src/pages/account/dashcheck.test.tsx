import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../../services/api', () => ({
  apiAsset: (p?: string) => p ?? '',
  api: {
    get: vi.fn((url: string) => {
      if (url.includes('notifications')) return Promise.resolve([])
      if (url.includes('marketer')) return Promise.resolve({ status: 'none' })
      return Promise.resolve([])
    }),
    post: vi.fn(() => Promise.resolve({})),
  },
}))
vi.mock('../../services/auth', () => ({
  useAuth: () => ({
    me: {
      id: '1',
      full_name: 'سارا تست',
      phone: '09150000000',
      roles: ['user'],
      is_marketer: false,
      ref_code: '',
      marketer_status: '',
    },
    loading: false,
    logout: vi.fn(),
    refresh: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
  }),
}))

import DashboardPage from './DashboardPage'
import AccountApp from './AccountApp'

describe('panel render', () => {
  it('dashboard renders', async () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/کل درخواست‌ها/)).toBeTruthy())
  })
  it('account app renders dashboard content', async () => {
    render(
      <MemoryRouter initialEntries={['/panel']}>
        <AccountApp />
      </MemoryRouter>
    )
    await waitFor(() => expect(screen.getByText(/کل درخواست‌ها/)).toBeTruthy())
  })
})
