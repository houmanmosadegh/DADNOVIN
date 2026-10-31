import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff, CheckCheck } from 'lucide-react'
import { api } from '../../services/api'
import type { Notif } from './types'
import { faDate } from './types'

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notif[] | null>(null)
  const [err, setErr] = useState('')
  const navigate = useNavigate()

  const load = () =>
    api
      .get<Notif[]>('/account/notifications')
      .then(setRows)
      .catch(() => setErr('خطا در بارگذاری اعلان‌ها'))
  useEffect(() => {
    void load()
  }, [])

  const mark = (n: Notif) => {
    if (!n.read) {
      void api
        .post(`/account/notifications/${n.id}/read`, {})
        .then(() => setRows((p) => p?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? p))
    }
    if (n.link?.startsWith('/panel')) navigate(n.link)
  }

  const markAll = () => {
    const pending = (rows ?? []).filter((n) => !n.read)
    setRows((p) => p?.map((n) => ({ ...n, read: true })) ?? p)
    void Promise.all(pending.map((n) => api.post(`/account/notifications/${n.id}/read`, {})))
  }

  const unread = (rows ?? []).filter((n) => !n.read).length

  return (
    <div className="acc__page">
      <div className="acc__page-head">
        <h1 className="acc__title">اعلان‌ها</h1>
        {unread > 0 && (
          <button className="btn btn--ghost" onClick={markAll}>
            <CheckCheck size={15} /> خواندن همه ({unread.toLocaleString('fa-IR')})
          </button>
        )}
      </div>
      {err ? (
        <p className="acc__err">{err}</p>
      ) : !rows ? (
        <div className="acc__card acc__skels">
          {[0, 1, 2].map((i) => (
            <span key={i} className="acc__skel" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="acc__card acc__empty">
          <BellOff size={40} aria-hidden="true" />
          <h2>اعلانی ندارید</h2>
          <p className="acc__muted">نتیجهٔ بررسی درخواست‌ها و پیام‌های کارشناسان اینجا می‌آید.</p>
        </div>
      ) : (
        <div className="acc__card acc__list">
          {rows.map((n) => (
            <button
              key={n.id}
              className={`acc__row acc__notif${n.read ? '' : ' is-unread'}`}
              onClick={() => mark(n)}
            >
              <span className="acc__notif-dot" aria-hidden="true" />
              <span className="acc__notif-body">
                <strong>{n.title}</strong>
                {n.body && <span className="acc__muted">{n.body}</span>}
              </span>
              <span className="acc__muted">{faDate(n.created_at)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
