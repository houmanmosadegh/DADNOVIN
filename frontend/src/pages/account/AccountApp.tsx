/** پنل کاربر — اپ مستقل با سایدبار و صفحات جداگانه (خارج از شِل سایت).
 *  Client-only authenticated app (lazy-loaded, not prerendered). */

import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Scale,
  Share2,
  UserRound,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../../services/auth'
import AuthPage from './AuthPage'
import DashboardPage from './DashboardPage'
import MarketingPage from './MarketingPage'
import NotificationsPage from './NotificationsPage'
import ProfilePage from './ProfilePage'
import RequestDetailPage from './RequestDetailPage'
import RequestsPage from './RequestsPage'
import WalletPage from './WalletPage'
import './account.css'

const STAFF_ROLES = ['super_admin', 'admin', 'editor', 'support']

export default function AccountApp() {
  const { me, loading, logout } = useAuth()
  const navigate = useNavigate()

  if (loading) {
    return (
      <div className="acc acc--gate">
        <p className="acc__muted">در حال بارگذاری…</p>
      </div>
    )
  }

  if (!me) {
    return <AuthPage />
  }

  const isStaff = me.roles.some((r) => STAFF_ROLES.includes(r))
  const items = [
    { to: '/panel', label: 'داشبورد', icon: <LayoutDashboard size={17} />, end: true },
    { to: '/panel/requests', label: 'درخواست‌های من', icon: <FileText size={17} /> },
    { to: '/panel/notifications', label: 'اعلان‌ها', icon: <Bell size={17} /> },
    { to: '/panel/marketing', label: 'بازاریابی', icon: <Share2 size={17} /> },
    ...(me.is_marketer
      ? [{ to: '/panel/wallet', label: 'کیف پول', icon: <Wallet size={17} /> }]
      : []),
    { to: '/panel/profile', label: 'پروفایل', icon: <UserRound size={17} /> },
  ]

  return (
    <div className="acc">
      <aside className="acc__side">
        <div className="acc__brand">
          <Scale size={20} aria-hidden="true" />
          <div>
            <strong>دادنوین</strong>
            <span>پنل کاربری</span>
          </div>
        </div>
        <nav className="acc__nav" aria-label="بخش‌های پنل">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => `acc__navlink${isActive ? ' is-active' : ''}`}
            >
              {it.icon} {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="acc__user">
          <p className="acc__username">{me.full_name}</p>
          <p className="acc__muted" dir="ltr">{me.phone}</p>
          {isStaff && <a className="acc__stafflink" href="/admin/">ورود به پنل مدیریت ←</a>}
          <div className="acc__user-actions">
            <a href="/" className="acc__sitelink">مشاهدهٔ سایت</a>
            <button
              className="acc__logout"
              onClick={() => void logout().then(() => navigate('/'))}
            >
              <LogOut size={14} /> خروج
            </button>
          </div>
        </div>
      </aside>

      <main className="acc__main">
        <Routes>
          <Route index element={<DashboardPage />} />
          <Route path="requests" element={<RequestsPage />} />
          <Route path="requests/:id" element={<RequestDetailPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="marketing" element={<MarketingPage />} />
          <Route path="wallet" element={<WalletPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </main>
    </div>
  )
}
