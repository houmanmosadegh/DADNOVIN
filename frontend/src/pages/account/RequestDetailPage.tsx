import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import type { RequestDetail } from './types'
import { CLOSED_STATUSES, STATUS_FA, faDateTime } from './types'

const SENDER_FA: Record<string, string> = {
  staff: 'کارشناس',
  assistant: 'پاسخ خودکار سیستم',
  customer: 'شما',
  system: 'سیستم',
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [reply, setReply] = useState('')
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    if (!id) return
    api
      .get<RequestDetail>(`/account/requests/${id}`)
      .then(setDetail)
      .catch(() => setErr('خطا در بارگذاری'))
  }, [id])
  useEffect(load, [load])

  const send = async () => {
    if (!id || !reply.trim()) return
    setSending(true)
    try {
      await api.post(`/account/requests/${id}/reply`, { body: reply.trim() })
      setReply('')
      load()
    } catch {
      setErr('ارسال ناموفق بود.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="acc__page">
      <Link to="/panel/requests" className="acc__back">
        → بازگشت به لیست
      </Link>
      {!detail && !err && <p className="acc__muted">در حال بارگذاری…</p>}
      {err && <p className="acc__err">{err}</p>}
      {detail && (
        <>
          <div className="acc__card">
            <h2>
              <span dir="ltr" className="acc__code">
                {detail.tracking_code}
              </span>{' '}
              <span className={`acc__badge acc__badge--${detail.status}`}>
                {STATUS_FA[detail.status] ?? detail.status}
              </span>
            </h2>
            <p className="acc__muted">
              {detail.topic} · {faDateTime(detail.created_at)}
            </p>
          </div>

          {detail.events.length > 0 && (
            <div className="acc__card">
              <h2>تاریخچهٔ وضعیت</h2>
              <ol className="acc__timeline">
                {detail.events.map((e, i) => (
                  <li key={i}>
                    <span className="acc__tl-dot" aria-hidden="true" />
                    <div>
                      <strong>{STATUS_FA[e.to] ?? e.to}</strong>
                      {e.from && <span className="acc__muted"> (از {STATUS_FA[e.from] ?? e.from})</span>}
                      <p className="acc__muted">{faDateTime(e.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="acc__card">
            <h2>گفتگو</h2>
            <div className="acc__thread">
              {detail.messages.length === 0 && <p className="acc__muted">هنوز پیامی نیست.</p>}
              {detail.messages.map((m) => (
                <div key={m.id} className={`acc__msg acc__msg--${m.sender_type}`}>
                  <p>{m.body}</p>
                  <span>
                    {faDateTime(m.created_at)} · {SENDER_FA[m.sender_type] ?? m.sender_type}
                  </span>
                </div>
              ))}
            </div>
            {CLOSED_STATUSES.includes(detail.status) ? (
              <p className="acc__muted acc__closed">
                این درخواست بسته شده است. برای پیگیری مجدد می‌توانید درخواست جدیدی ثبت کنید.
              </p>
            ) : (
              <div className="acc__reply">
                <textarea
                  rows={3}
                  placeholder="پاسخ شما…"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <button className="btn btn--primary" disabled={!reply.trim() || sending} onClick={send}>
                  {sending ? 'در حال ارسال…' : 'ارسال'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
