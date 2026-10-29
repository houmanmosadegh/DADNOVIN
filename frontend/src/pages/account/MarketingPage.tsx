import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, Share2 } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import type { MarketerHome, Referral } from './types'
import { STATUS_FA, faDate } from './types'

export default function MarketingPage() {
  const { me, refresh } = useAuth()
  const [home, setHome] = useState<MarketerHome | null>(null)
  const [refs, setRefs] = useState<Referral[]>([])
  const [note, setNote] = useState('')
  const [msg, setMsg] = useState('')
  const isMarketer = me?.is_marketer ?? false

  useEffect(() => {
    api.get<MarketerHome>('/account/marketer').then(setHome).catch(() => setHome({ status: 'none' }))
  }, [isMarketer])
  useEffect(() => {
    if (!isMarketer) return
    api.get<Referral[]>('/account/marketer/referrals').then(setRefs).catch(() => {})
  }, [isMarketer])

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setMsg('کپی شد'))
  }
  const apply = async () => {
    try {
      await api.post('/account/marketer/apply', { note })
      setMsg('درخواست شما ثبت شد؛ پس از تأیید مدیریت فعال می‌شود.')
      await refresh()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }

  if (!home) return <div className="acc__page"><p className="acc__muted">در حال بارگذاری…</p></div>

  if (!isMarketer) {
    return (
      <div className="acc__page">
        <h1 className="acc__title">بازاریابی</h1>
        <div className="acc__card">
          <h2><Share2 size={17} /> درخواست بازاریاب شدن</h2>
          {home.status === 'pending' ? (
            <p className="acc__muted">درخواست شما در انتظار بررسی مدیریت است.</p>
          ) : (
            <>
              {home.status === 'rejected' && (
                <p className="acc__muted">درخواست قبلی شما تأیید نشد — می‌توانید دوباره درخواست دهید.</p>
              )}
              <p className="acc__muted">
                با دریافت کد ارجاع اختصاصی، کاربرانی که با لینک شما درخواست مشاوره ثبت کنند به حساب شما منسوب می‌شوند.
              </p>
              <div className="acc__apply">
                <textarea
                  rows={3}
                  placeholder="چرا می‌خواهید بازاریاب شوید؟ (اختیاری)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button className="btn btn--primary" onClick={apply}>ارسال درخواست</button>
              </div>
            </>
          )}
          {msg && <p className="acc__notice">{msg}</p>}
        </div>
      </div>
    )
  }

  const link = `${window.location.origin}${home.ref_link ?? ''}`

  return (
    <div className="acc__page">
      <h1 className="acc__title">بازاریابی</h1>

      <div className="acc__card">
        <h2>کد و لینک ارجاع شما</h2>
        <div className="acc__refbox">
          <code dir="ltr">{home.ref_code}</code>
          <button className="btn btn--ghost" onClick={() => copy(home.ref_code ?? '')}>
            <Copy size={14} /> کپی کد
          </button>
          <button className="btn btn--ghost" onClick={() => copy(link)}>
            <Copy size={14} /> کپی لینک
          </button>
        </div>
        {home.is_active === false && <p className="acc__err">کد شما توسط مدیریت غیرفعال شده است.</p>}
        {msg && <p className="acc__notice">{msg}</p>}
      </div>

      <div className="acc__stats">
        <div className="acc__card acc__stat"><p className="acc__stat-num">{(home.stats?.clicks ?? 0).toLocaleString('fa-IR')}</p><p className="acc__muted">کلیک</p></div>
        <div className="acc__card acc__stat"><p className="acc__stat-num">{(home.stats?.requests ?? 0).toLocaleString('fa-IR')}</p><p className="acc__muted">درخواست منسوب</p></div>
        <div className="acc__card acc__stat"><p className="acc__stat-num">{(home.stats?.accepted ?? 0).toLocaleString('fa-IR')}</p><p className="acc__muted">پذیرفته‌شده</p></div>
        <div className="acc__card acc__stat"><p className="acc__stat-num">{(home.stats?.conversion ?? 0).toLocaleString('fa-IR')}٪</p><p className="acc__muted">نرخ تبدیل</p></div>
      </div>

      <div className="acc__card">
        <h2>ارجاع‌های اخیر</h2>
        {refs.length === 0 ? <p className="acc__muted">هنوز ارجاعی ثبت نشده است.</p> : (
          <div className="acc__list">
            {refs.map((r, i) => (
              <div key={i} className="acc__row">
                <span className="acc__row-topic">{r.masked_name}</span>
                <span className="acc__badge">{STATUS_FA[r.status] ?? r.status}</span>
                <span className="acc__muted">{faDate(r.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!home.commission_enabled ? (
        <p className="acc__muted">سیستم کمیسیون فعلاً غیرفعال است؛ آمار ارجاع همچنان ثبت می‌شود.</p>
      ) : (
        <p className="acc__muted">موجودی و برداشت در <Link to="/panel/wallet">کیف پول</Link>.</p>
      )}
    </div>
  )
}
