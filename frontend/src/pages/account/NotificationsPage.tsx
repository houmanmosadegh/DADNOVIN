import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import type { Notif } from './types'
import { faDate } from './types'

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notif[] | null>(null)

  useEffect(() => {
    api.get<Notif[]>('/account/notifications').then(setRows).catch(() => setRows([]))
  }, [])

  const mark = (n: Notif) => {
    if (n.read) return
    void api.post(`/account/notifications/${n.id}/read`, {}).then(() =>
      setRows((p) => p?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? p),
    )
  }

  return (
    <div className="acc__page">
      <h1 className="acc__title">اعلان‌ها</h1>
      {!rows ? (
        <p className="acc__muted">در حال بارگذاری…</p>
      ) : rows.length === 0 ? (
        <div className="acc__card acc__empty"><p>اعلانی ندارید.</p></div>
      ) : (
        <div className="acc__card acc__list">
          {rows.map((n) => (
            <button key={n.id} className={`acc__row acc__notif${n.read ? '' : ' is-unread'}`} onClick={() => mark(n)}>
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
