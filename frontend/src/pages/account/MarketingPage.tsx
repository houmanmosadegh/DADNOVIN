import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock3, Copy, Share2, XCircle } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import type { MarketerHome, Referral } from './types'
import { STATUS_FA, faDate } from './types'

const CHANNELS = [
  'اینستاگرام', 'تلگرام', 'واتس‌اپ', 'وب‌سایت / وبلاگ', 'معرفی حضوری', 'سایر',
]

export default function MarketingPage() {
  const { me, refresh } = useAuth()
  const [home, setHome] = useState<MarketerHome | null>(null)
  const [refs, setRefs] = useState<Referral[]>([])
  const [note, setNote] = useState('')
  const [channel, setChannel] = useState(CHANNELS[0])
  const [terms, setTerms] = useState(false)
  const [termsErr, setTermsErr] = useState(false)
  const [busy, setBusy] = useState(false)
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
    if (!terms) {
      setTermsErr(true)
      return
    }
    setBusy(true)
    try {
      await api.post('/account/marketer/apply', { note, channel, terms })
      setMsg('درخواست شما ثبت شد؛ پس از تأیید مدیریت فعال می‌شود.')
      await refresh()
      api.get<MarketerHome>('/account/marketer').then(setHome).catch(() => {})
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }

  if (!home) return <div className="acc__page"><p className="acc__muted">در حال بارگذاری…</p></div>

  if (!isMarketer) {
    const reapplyDate = home.reapply_at ? new Date(home.reapply_at) : null
    const mustWait = reapplyDate !== null && reapplyDate > new Date()
    return (
      <div className="acc__page">
        <h1 className="acc__title">بازاریابی</h1>
        <div className="acc__card">
          <h2><Share2 size={17} /> درخواست بازاریاب شدن</h2>

          {home.status === 'pending' ? (
            <div className="acc__state acc__state--pending">
              <Clock3 size={20} aria-hidden="true" />
              <div>
                <p>درخواست شما در حال بررسی است.</p>
                {home.applied_at && (
                  <p className="acc__muted">ثبت‌شده در {faDate(home.applied_at)} — نتیجه از طریق اعلان اطلاع‌رسانی می‌شود.</p>
                )}
              </div>
            </div>
          ) : (
            <>
              {home.status === 'rejected' && (
                <div className="acc__state acc__state--rejected">
                  <XCircle size={20} aria-hidden="true" />
                  <div>
                    <p>درخواست قبلی شما تأیید نشد.</p>
                    {home.reject_reason && <p className="acc__muted">دلیل: {home.reject_reason}</p>}
                    {mustWait && reapplyDate && (
                      <p className="acc__muted">امکان ثبت مجدد از {faDate(reapplyDate.toISOString())}</p>
                    )}
                  </div>
                </div>
              )}
              {mustWait ? null : (
                <>
                  <p className="acc__muted">
                    با دریافت کد ارجاع اختصاصی، کاربرانی که با لینک شما درخواست مشاوره ثبت کنند به حساب شما منسوب می‌شوند.
                  </p>
                  <div className="acc__apply">
                    <label className="acc__field">
                      <span>کانال اصلی معرفی</span>
                      <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                        {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="acc__field">
                      <span>توضیح کوتاه <em>(اختیاری)</em></span>
                      <textarea
                        rows={3}
                        placeholder="چطور می‌خواهید دادنوین را معرفی کنید؟"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <label className="authp__check">
                      <input
                        type="checkbox"
                        checked={terms}
                        onChange={(e) => { setTerms(e.target.checked); setTermsErr(false) }}
                      />
                      <span>قوانین بازاریابی و حفظ محرمانگی موکل را می‌پذیرم</span>
                    </label>
                    {termsErr && <em className="acc__hint authp__hint--err">پذیرش قوانین الزامی است.</em>}
                    <button className="btn btn--primary" disabled={busy} onClick={apply}>
                      {busy ? 'در حال ارسال…' : 'ارسال درخواست'}
                    </button>
                  </div>
                </>
              )}
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
