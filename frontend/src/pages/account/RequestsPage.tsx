import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import type { MyRequest } from './types'
import { STATUS_FA, faDate } from './types'

export default function RequestsPage() {
  const [rows, setRows] = useState<MyRequest[] | null>(null)

  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => setRows([]))
  }, [])

  return (
    <div className="acc__page">
      <div className="acc__page-head">
        <h1 className="acc__title">درخواست‌های من</h1>
        <Link to="/consultation" className="btn btn--primary">ثبت درخواست جدید</Link>
      </div>

      {!rows ? (
        <p className="acc__muted">در حال بارگذاری…</p>
      ) : rows.length === 0 ? (
        <div className="acc__card acc__empty">
          <p>هنوز درخواستی ثبت نکرده‌اید.</p>
          <Link to="/consultation" className="btn btn--primary">فرم مشاوره</Link>
        </div>
      ) : (
        <div className="acc__card acc__list">
          {rows.map((r) => (
            <Link key={r.id} to={`/account/requests/${r.id}`} className="acc__row">
              <span dir="ltr" className="acc__code">{r.tracking_code}</span>
              <span className="acc__row-topic">{r.topic || '—'}</span>
              <span className={`acc__badge acc__badge--${r.status}`}>{STATUS_FA[r.status] ?? r.status}</span>
              <span className="acc__muted">{faDate(r.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
