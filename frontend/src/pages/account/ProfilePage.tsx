import { useState } from 'react'
import { CalendarDays, Phone, ShieldCheck, UserRound } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import { faDate } from './types'

const ROLE_FA: Record<string, string> = {
  user: 'کاربر', marketer: 'بازاریاب', support: 'پشتیبان',
  editor: 'ویراستار', admin: 'مدیر', super_admin: 'مدیر ارشد',
}

export default function ProfilePage() {
  const { me, refresh } = useAuth()
  const [name, setName] = useState(me?.full_name ?? '')
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')

  const saveProfile = async () => {
    setBusy('profile'); setErr(''); setMsg('')
    try {
      await api.patch('/account/me', { full_name: name })
      await refresh()
      setMsg('ذخیره شد.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    } finally { setBusy('') }
  }
  const savePw = async () => {
    setBusy('pw'); setErr(''); setMsg('')
    try {
      await api.post('/account/password', { current: pw.current, new: pw.next })
      setPw({ current: '', next: '', confirm: '' })
      setMsg('رمز عبور تغییر کرد.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    } finally { setBusy('') }
  }

  const pwMismatch = pw.next.length >= 8 && pw.confirm !== pw.next && pw.confirm.length > 0

  return (
    <div className="acc__page">
      <h1 className="acc__title">پروفایل</h1>
      {err && <p className="acc__err">{err}</p>}
      {msg && <p className="acc__notice">{msg}</p>}

      {/* کارت هویت */}
      <div className="acc__card acc__idcard">
        <span className="acc__avatar acc__avatar--lg" aria-hidden="true"><UserRound size={26} /></span>
        <div className="acc__idcard-body">
          <p className="acc__username">{me?.full_name}</p>
          <div className="acc__idmeta">
            <span dir="ltr"><Phone size={13} /> {me?.phone || '—'}</span>
            {me?.created_at && <span><CalendarDays size={13} /> عضویت از {faDate(me.created_at)}</span>}
          </div>
        </div>
        <div className="acc__idroles">
          {(me?.roles ?? []).map((r) => (
            <span key={r} className="acc__rolechip"><ShieldCheck size={12} /> {ROLE_FA[r] ?? r}</span>
          ))}
        </div>
      </div>

      <div className="acc__grid">
        <div className="acc__card">
          <h2>مشخصات</h2>
          <label className="acc__field">
            <span>نام و نام خانوادگی</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <p className="acc__muted">شماره موبایل برای ورود استفاده می‌شود و قابل تغییر نیست.</p>
          <button className="btn btn--primary" disabled={busy === 'profile' || name.trim().length < 3} onClick={saveProfile}>
            {busy === 'profile' ? 'در حال ذخیره…' : 'ذخیره'}
          </button>
        </div>
        <div className="acc__card">
          <h2>تغییر رمز عبور</h2>
          <label className="acc__field">
            <span>رمز فعلی</span>
            <input dir="ltr" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="acc__field">
            <span>رمز جدید (حداقل ۸ کاراکتر)</span>
            <input dir="ltr" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <label className="acc__field">
            <span>تکرار رمز جدید</span>
            <input dir="ltr" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            {pwMismatch && <em className="acc__hint authp__hint--err">تکرار رمز یکسان نیست.</em>}
          </label>
          <button
            className="btn btn--ghost"
            disabled={busy === 'pw' || !pw.current || pw.next.length < 8 || pw.confirm !== pw.next}
            onClick={savePw}
          >
            {busy === 'pw' ? 'در حال تغییر…' : 'تغییر رمز'}
          </button>
        </div>
      </div>
    </div>
  )
}
