/** پنل کاربر — اپ مستقل: سایدبار سورمه‌ای سمت راست + topbar + drawer موبایل.
 *  Client-only authenticated app (lazy-loaded, not prerendered). */

import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Share2,
  UserRound,
  X,
} from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import AuthPage from './AuthPage'
import DashboardPage from './DashboardPage'
import MarketingPage from './MarketingPage'
import NewRequestPage from './NewRequestPage'
import NotificationsPage from './NotificationsPage'
import ProfilePage from './ProfilePage'
import RequestDetailPage from './RequestDetailPage'
import RequestsPage from './RequestsPage'
import './account.css'
import type { Notif } from './types'

const STAFF_ROLES = ['super_admin', 'admin', 'editor', 'support']

const TITLES: [string, string][] = [
  ['/panel/requests/new', 'ثبت درخواست جدید'],
  ['/panel/requests', 'درخواست‌های مشاوره'],
  ['/panel/notifications', 'اعلان‌ها'],
  ['/panel/marketing', 'بازاریابی'],
  ['/panel/profile', 'پروفایل'],
]

export default function AccountApp() {
  const { me, loading, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  const [unread, setUnread] = useState(0)

  useEffect(() => setDrawer(false), [pathname])

  // ادمین روی ریشهٔ پنل کاربر → پیش‌فرض پنل مدیریت (مسیرهای داخلی آزادند)
  useEffect(() => {
    if (me?.roles.some((r) => STAFF_ROLES.includes(r)) && pathname === '/panel') {
      window.location.assign('/admin/')
    }
  }, [me, pathname])
  useEffect(() => {
    if (!me) return
    api.get<Notif[]>('/account/notifications')
      .then((rows) => setUnread(rows.filter((n) => !n.read).length))
      .catch(() => {})
  }, [me, pathname])

  const title = useMemo(() => {
    if (pathname === '/panel') return 'داشبورد'
    for (const [prefix, t] of TITLES) if (pathname.startsWith(prefix)) return t
    return 'پنل کاربری'
  }, [pathname])

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
  // منوی ۵‌تایی (spec §5) — اعلان‌ها زنگ topbar؛ «درخواست جدید» CTA است
  const items: { to: string; label: string; icon: React.ReactNode; end?: boolean; badge?: number }[] = [
    { to: '/panel', label: 'داشبورد', icon: <LayoutDashboard size={17} />, end: true },
    { to: '/panel/requests', label: 'درخواست‌های من', icon: <FileText size={17} /> },
    { to: '/panel/marketing', label: 'بازاریابی', icon: <Share2 size={17} /> },
    { to: '/panel/profile', label: 'پروفایل', icon: <UserRound size={17} /> },
  ]

  return (
    <div className={`acc${drawer ? ' is-drawer' : ''}`}>
      {/* topbar */}
      <header className="acc__topbar">
        <button
          className="acc__burger"
          aria-label={drawer ? 'بستن منو' : 'باز کردن منو'}
          aria-expanded={drawer}
          onClick={() => setDrawer((v) => !v)}
        >
          {drawer ? <X size={20} /> : <Menu size={20} />}
        </button>
        <h1 className="acc__topbar-title">{title}</h1>
        <nav className="acc__topbar-actions">
          <NavLink to="/panel/notifications" className="acc__iconbtn" aria-label="اعلان‌ها">
            <Bell size={18} />
            {unread > 0 && <span className="acc__dot" aria-hidden="true" />}
          </NavLink>
          <NavLink to="/panel/requests/new" className="btn btn--primary acc__cta">
            درخواست مشاورهٔ جدید
          </NavLink>
        </nav>
      </header>

      {drawer && <div className="acc__scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      {/* sidebar */}
      <aside className="acc__side">
        <NavLink to="/panel" className="acc__brand" end>
          <img src="/images/logo-mark.png" alt="" width={30} height={24} decoding="async" />
          <div>
            <strong>دادنوین</strong>
            <span>پنل کاربری</span>
          </div>
        </NavLink>

        <div className="acc__who">
          <span className="acc__avatar" aria-hidden="true">
            <UserRound size={18} />
          </span>
          <div>
            <p className="acc__username">{me.full_name}</p>
            <p className="acc__muted" dir="ltr">{me.phone}</p>
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
              {it.icon}
              <span className="acc__navlabel">{it.label}</span>
              {!!it.badge && <span className="acc__badge-mini">{it.badge.toLocaleString('fa-IR')}</span>}
            </NavLink>
          ))}
          {/* آیتم پنجم — خروج */}
          <button
            className="acc__navlink acc__navlink--logout"
            onClick={() => void logout().then(() => navigate('/'))}
          >
            <LogOut size={17} />
            <span className="acc__navlabel">خروج</span>
          </button>
        </nav>

        <div className="acc__side-foot">
          {isStaff && <a className="acc__stafflink" href="/admin/">ورود به پنل مدیریت ←</a>}
          <a href="/" className="acc__sitelink">مشاهدهٔ سایت</a>
        </div>
      </aside>

      <main className="acc__main">
        <Routes>
          <Route path="/panel" element={<DashboardPage />} />
          <Route path="/panel/requests" element={<RequestsPage />} />
          <Route path="/panel/requests/new" element={<NewRequestPage />} />
          <Route path="/panel/requests/:id" element={<RequestDetailPage />} />
          <Route path="/panel/notifications" element={<NotificationsPage />} />
          <Route path="/panel/marketing" element={<MarketingPage />} />
          <Route path="/panel/wallet" element={<Navigate to="/panel/marketing?tab=commissions" replace />} />
          <Route path="/panel/profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/panel" replace />} />
        </Routes>
      </main>
    </div>
  )
}
