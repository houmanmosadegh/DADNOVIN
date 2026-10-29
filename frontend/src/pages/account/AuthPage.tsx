/** صفحهٔ ورود/ثبت‌نام پنل کاربر — جایگزین مودال؛ گیتِ /account. */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Lock, Phone, Scale, Ticket, UserRound } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import { readRefCookie } from '../../services/referral'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const faToEn = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

const STAFF = ['super_admin', 'admin', 'editor', 'support']

export default function AuthPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [f, setF] = useState({
    name: '', phone: '', password: '', ref: readRefCookie(), token: '', newPassword: '',
  })

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  const go = (m: Mode) => {
    setMode(m)
    setErr('')
    setNotice('')
  }

  const done = (me: { roles: string[] }) => {
    navigate(me.roles.some((r) => STAFF.includes(r)) ? '/panel/' : '/account')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    const phone = faToEn(f.phone.trim())
    try {
      if (mode === 'login') {
        done(await login(phone, f.password))
      } else if (mode === 'register') {
        done(
          await register({
            full_name: f.name.trim(),
            phone,
            password: f.password,
            ref_code: f.ref.trim().toUpperCase(),
          }),
        )
      } else if (mode === 'forgot') {
        const r = await api.post<{ message: string }>('/account-auth/forgot', { phone })
        setNotice(r.message)
        setMode('reset')
      } else {
        const r = await api.post<{ message: string }>('/account-auth/reset', {
          token: f.token.trim(),
          password: f.newPassword,
        })
        setNotice(r.message)
        setMode('login')
      }
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'خطا — دوباره تلاش کنید.')
    } finally {
      setBusy(false)
    }
  }

  const inForm = mode === 'login' || mode === 'register'

  return (
    <div className="authp">
      <div className="authp__glow" aria-hidden="true" />
      <div className="authp__card">
        {/* برند — ستون تزئینی */}
        <aside className="authp__brand">
          <a className="authp__back" href="/"><ArrowLeft size={14} /> بازگشت به سایت</a>
          <div className="authp__mark">
            <Scale size={30} aria-hidden="true" />
          </div>
          <h1 className="authp__name">دادنوین</h1>
          <p className="authp__motto">«عدالت، حق همه است…»</p>
          <ul className="authp__points" role="list">
            <li>پیگیری آنلاین درخواست مشاوره</li>
            <li>گفتگوی مستقیم با کارشناس</li>
            <li>اعلان وضعیت و تغییرات پرونده</li>
          </ul>
        </aside>

        {/* فرم */}
        <div className="authp__panel">
          {inForm ? (
            <div className="authp__tabs" role="tablist" aria-label="ورود یا ثبت‌نام">
              <button
                role="tab" aria-selected={mode === 'login'}
                className={mode === 'login' ? 'is-active' : ''}
                onClick={() => go('login')}
              >
                ورود
              </button>
              <button
                role="tab" aria-selected={mode === 'register'}
                className={mode === 'register' ? 'is-active' : ''}
                onClick={() => go('register')}
              >
                ثبت‌نام
              </button>
            </div>
          ) : (
            <h2 className="authp__title">
              {mode === 'forgot' ? 'بازیابی رمز عبور' : 'تعیین رمز جدید'}
            </h2>
          )}

          {notice && (
            <p className="authp__notice" role="status"><CheckCircle2 size={15} /> {notice}</p>
          )}
          {err && (
            <p className="authp__err" role="alert"><AlertCircle size={15} /> {err}</p>
          )}

          <form onSubmit={submit} className="authp__form" noValidate={false}>
            {mode === 'register' && (
              <label className="authp__field">
                <span><UserRound size={13} /> نام و نام خانوادگی</span>
                <input value={f.name} onChange={set('name')} required minLength={3} placeholder="مثلاً علی رضایی" />
              </label>
            )}
            {mode !== 'reset' && (
              <label className="authp__field">
                <span><Phone size={13} /> {mode === 'login' ? 'شماره موبایل یا نام کاربری' : 'شماره موبایل'}</span>
                <input
                  dir="ltr" inputMode={mode === 'login' ? 'text' : 'tel'}
                  autoComplete={mode === 'login' ? 'username' : 'tel'}
                  placeholder={mode === 'login' ? '0912… یا نام کاربری' : '0912 000 0000'}
                  value={f.phone} onChange={set('phone')} required
                />
              </label>
            )}
            {inForm && (
              <label className="authp__field">
                <span>
                  <Lock size={13} /> رمز عبور
                  {mode === 'register' && <em>حداقل ۸ کاراکتر</em>}
                </span>
                <input
                  dir="ltr" type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={f.password} onChange={set('password')}
                  required minLength={mode === 'register' ? 8 : 1}
                />
              </label>
            )}
            {mode === 'register' && (
              <label className="authp__field">
                <span>کد معرف <em>اختیاری</em></span>
                <input dir="ltr" value={f.ref} onChange={set('ref')} placeholder="DN-XXXXXX" />
              </label>
            )}
            {mode === 'reset' && (
              <>
                <label className="authp__field">
                  <span><Ticket size={13} /> کد بازیابی</span>
                  <input dir="ltr" value={f.token} onChange={set('token')} required placeholder="کد ارسال‌شده" />
                </label>
                <label className="authp__field">
                  <span><Lock size={13} /> رمز جدید <em>حداقل ۸ کاراکتر</em></span>
                  <input dir="ltr" type="password" autoComplete="new-password" value={f.newPassword} onChange={set('newPassword')} required minLength={8} />
                </label>
              </>
            )}
            <button className="authp__submit" disabled={busy}>
              {busy
                ? 'در حال بررسی…'
                : mode === 'login'
                  ? 'ورود به پنل کاربری'
                  : mode === 'register'
                    ? 'ایجاد حساب و ورود'
                    : mode === 'forgot'
                      ? 'ارسال کد بازیابی'
                      : 'تغییر رمز و ورود'}
            </button>
          </form>

          <div className="authp__links">
            {mode === 'login' && (
              <button className="authp__link" onClick={() => go('forgot')}>
                رمز عبور را فراموش کرده‌ام
              </button>
            )}
            {!inForm && (
              <button className="authp__link" onClick={() => go('login')}>
                بازگشت به ورود
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
