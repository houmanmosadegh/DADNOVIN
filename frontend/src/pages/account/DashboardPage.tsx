import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, FileText, Inbox, MessageSquarePlus, PenSquare, PhoneCall } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import type { MyRequest, Notif } from './types'
import { CLOSED_STATUSES, STATUS_FA, faDate } from './types'

export default function DashboardPage() {
  const { me } = useAuth()
  const [rows, setRows] = useState<MyRequest[] | null>(null)
  const [notifs, setNotifs] = useState<Notif[] | null>(null)

  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => setRows([]))
    api.get<Notif[]>('/account/notifications').then(setNotifs).catch(() => setNotifs([]))
  }, [])

  const open = (rows ?? []).filter((r) => !CLOSED_STATUSES.includes(r.status))
  const newReplies = (rows ?? []).filter((r) => r.has_new_reply)
  const unread = (notifs ?? []).filter((n) => !n.read)
  const recent = (rows ?? []).slice(0, 5)
  const today = new Date().toLocaleDateString('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="acc__page">
      {/* سلام + قدم بعدی */}
      <div className="acc__hello">
        <div>
          <h1 className="acc__title">سلام {me?.full_name?.split(' ')[0] || ''} 👋</h1>
          <p className="acc__muted">{today}</p>
        </div>
        <Link to="/panel/requests/new" className="btn btn--primary">
          <PenSquare size={15} /> درخواست مشاورهٔ جدید
        </Link>
      </div>

      {/* آمار */}
      <div className="acc__stats">
        <Link to="/panel/requests" className="acc__card acc__stat">
          <span className="acc__stat-ico"><FileText size={18} /></span>
          <p className="acc__stat-num">{(rows?.length ?? 0).toLocaleString('fa-IR')}</p>
          <p className="acc__muted">کل درخواست‌ها</p>
        </Link>
        <Link to="/panel/requests" className="acc__card acc__stat">
          <span className="acc__stat-ico"><Inbox size={18} /></span>
          <p className="acc__stat-num">{open.length.toLocaleString('fa-IR')}</p>
          <p className="acc__muted">در جریان</p>
        </Link>
        <Link to="/panel/requests" className="acc__card acc__stat">
          <span className="acc__stat-ico"><MessageSquarePlus size={18} /></span>
          <p className="acc__stat-num">{newReplies.length.toLocaleString('fa-IR')}</p>
          <p className="acc__muted">پاسخ جدید</p>
        </Link>
        <Link to="/panel/notifications" className="acc__card acc__stat">
          <span className="acc__stat-ico"><Bell size={18} /></span>
          <p className="acc__stat-num">{unread.length.toLocaleString('fa-IR')}</p>
          <p className="acc__muted">اعلان خوانده‌نشده</p>
        </Link>
      </div>

      <div className="acc__dashgrid">
        {/* آخرین درخواست‌ها */}
        <div className="acc__card">
          <div className="acc__cardhead">
            <h2>آخرین درخواست‌ها</h2>
            {(rows?.length ?? 0) > 5 && <Link to="/panel/requests" className="acc__sitelink">همه ←</Link>}
          </div>
          {!rows ? (
            <div className="acc__skels">{[0, 1].map((i) => <span key={i} className="acc__skel" />)}</div>
          ) : recent.length === 0 ? (
            <div className="acc__empty">
              <p>هنوز درخواستی ثبت نکرده‌اید.</p>
              <p className="acc__muted">اولین قدم: ثبت درخواست مشاوره — کارشناسان بررسی می‌کنند.</p>
              <Link to="/panel/requests/new" className="btn btn--primary">ثبت درخواست مشاوره</Link>
            </div>
          ) : (
            <div className="acc__list">
              {recent.map((r) => (
                <Link key={r.id} to={`/panel/requests/${r.id}`} className="acc__row">
                  <span dir="ltr" className="acc__code">{r.tracking_code}</span>
                  <span className="acc__row-topic">
                    {r.topic || '—'}
                    {r.has_new_reply && <span className="acc__newreply">پاسخ جدید</span>}
                  </span>
                  <span className={`acc__badge acc__badge--${r.status}`}>{STATUS_FA[r.status] ?? r.status}</span>
                  <span className="acc__muted">{faDate(r.created_at)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* اعلان‌های اخیر + تماس */}
        <div className="acc__dashside">
          <div className="acc__card">
            <div className="acc__cardhead">
              <h2>اعلان‌های اخیر</h2>
              <Link to="/panel/notifications" className="acc__sitelink">همه ←</Link>
            </div>
            {!notifs ? (
              <div className="acc__skels"><span className="acc__skel" /></div>
            ) : notifs.length === 0 ? (
              <p className="acc__muted">اعلانی ندارید.</p>
            ) : (
              <div className="acc__list">
                {notifs.slice(0, 4).map((n) => (
                  <div key={n.id} className={`acc__row acc__notif${n.read ? '' : ' is-unread'}`}>
                    <span className="acc__notif-body">
                      <strong>{n.title}</strong>
                      {n.body && <span className="acc__muted">{n.body}</span>}
                    </span>
                    <span className="acc__muted">{faDate(n.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="acc__card acc__contact">
            <h2><PhoneCall size={16} /> نیاز به گفتگوی مستقیم؟</h2>
            <p className="acc__muted">برای پیگیری فوری می‌توانید با دفتر تماس بگیرید.</p>
            <a className="btn btn--ghost" href="/contact">اطلاعات تماس دفتر</a>
          </div>
        </div>
      </div>
    </div>
  )
}
