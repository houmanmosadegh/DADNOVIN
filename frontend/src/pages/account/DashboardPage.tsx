import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import type { MyRequest, Notif } from './types'
import { STATUS_FA, faDate } from './types'

export default function DashboardPage() {
  const [rows, setRows] = useState<MyRequest[] | null>(null)
  const [notifs, setNotifs] = useState<Notif[]>([])

  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => setRows([]))
    api.get<Notif[]>('/account/notifications').then(setNotifs).catch(() => {})
  }, [])

  const open = (rows ?? []).filter((r) => !['completed', 'cancelled', 'rejected'].includes(r.status))
  const unread = notifs.filter((n) => !n.read)
  const recent = (rows ?? []).slice(0, 5)

  return (
    <div className="acc__page">
      <h1 className="acc__title">داشبورد</h1>

      <div className="acc__stats">
        <Link to="/panel/requests" className="acc__card acc__stat">
          <p className="acc__stat-num">{(rows?.length ?? 0).toLocaleString('fa-IR')}</p>
          <p className="acc__muted">کل درخواست‌ها</p>
        </Link>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{open.length.toLocaleString('fa-IR')}</p>
          <p className="acc__muted">در جریان</p>
        </div>
        <Link to="/panel/notifications" className="acc__card acc__stat">
          <p className="acc__stat-num">{unread.length.toLocaleString('fa-IR')}</p>
          <p className="acc__muted">اعلان خوانده‌نشده</p>
        </Link>
      </div>

      <div className="acc__card">
        <h2>آخرین درخواست‌ها</h2>
        {!rows ? (
          <p className="acc__muted">در حال بارگذاری…</p>
        ) : recent.length === 0 ? (
          <div className="acc__empty">
            <p>هنوز درخواستی ثبت نکرده‌اید.</p>
            <Link to="/consultation" className="btn btn--primary">ثبت درخواست مشاوره</Link>
          </div>
        ) : (
          <div className="acc__list">
            {recent.map((r) => (
              <Link key={r.id} to={`/panel/requests/${r.id}`} className="acc__row">
                <span dir="ltr" className="acc__code">{r.tracking_code}</span>
                <span className="acc__row-topic">{r.topic || '—'}</span>
                <span className={`acc__badge acc__badge--${r.status}`}>{STATUS_FA[r.status] ?? r.status}</span>
                <span className="acc__muted">{faDate(r.created_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
