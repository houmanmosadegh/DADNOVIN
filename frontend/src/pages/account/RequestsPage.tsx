import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Inbox, Search } from 'lucide-react'
import { api } from '../../services/api'
import type { MyRequest } from './types'
import { CLOSED_STATUSES, STATUS_FA, faDate } from './types'

const FILTERS: [string, string][] = [
  ['all', 'همه'],
  ['open', 'باز'],
  ['closed', 'بسته‌شده'],
]

export default function RequestsPage() {
  const [rows, setRows] = useState<MyRequest[] | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => setErr('خطا در بارگذاری درخواست‌ها'))
  }, [])

  const view = useMemo(() => {
    let list = rows ?? []
    if (filter === 'open') list = list.filter((r) => !CLOSED_STATUSES.includes(r.status))
    if (filter === 'closed') list = list.filter((r) => CLOSED_STATUSES.includes(r.status))
    const s = q.trim()
    if (s) list = list.filter((r) => r.tracking_code.includes(s) || (r.topic || '').includes(s))
    return list
  }, [rows, q, filter])

  return (
    <div className="acc__page">
      <div className="acc__page-head">
        <h1 className="acc__title">درخواست‌های من</h1>
        <Link to="/panel/requests/new" className="btn btn--primary">ثبت درخواست جدید</Link>
      </div>

      <div className="acc__toolbar">
        <div className="acc__chips" role="tablist" aria-label="فیلتر وضعیت">
          {FILTERS.map(([k, fa]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              className={`acc__chip${filter === k ? ' is-active' : ''}`}
              onClick={() => setFilter(k)}
            >
              {fa}
            </button>
          ))}
        </div>
        <div className="acc__search">
          <Search size={15} aria-hidden="true" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجو در کد یا موضوع…"
            aria-label="جستجوی درخواست‌ها"
          />
        </div>
      </div>

      {err ? (
        <p className="acc__err">{err}</p>
      ) : !rows ? (
        <div className="acc__card acc__skels" aria-busy="true">
          {[0, 1, 2].map((i) => <span key={i} className="acc__skel" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="acc__card acc__empty">
          <Inbox size={40} aria-hidden="true" />
          <h2>هنوز درخواستی ندارید</h2>
          <p className="acc__muted">اولین درخواست مشاوره خود را ثبت کنید تا کارشناسان بررسی کنند.</p>
          <Link to="/panel/requests/new" className="btn btn--primary">ثبت درخواست جدید</Link>
        </div>
      ) : view.length === 0 ? (
        <div className="acc__card acc__empty">
          <p className="acc__muted">موردی با این فیلتر یافت نشد.</p>
        </div>
      ) : (
        <div className="acc__card acc__list">
          {view.map((r) => (
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
  )
}
