/** Login / register / reset modal — opened from the header. */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../services/auth'
import { readRefCookie } from '../services/referral'
import './AuthModal.css'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const faToEn = (s: string) =>
  s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

export function AuthModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [f, setF] = useState({
    name: '',
    phone: '',
    password: '',
    ref: '',
    token: '',
    newPassword: '',
  })
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setErr('')
    setNotice('')
    setMode('login')
    setF((p) => ({ ...p, ref: readRefCookie() }))
    dialogRef.current?.querySelector('input')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.documentElement.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))

  const done = (me: { roles: string[] }) => {
    onClose()
    navigate(me.roles.some((r) => ['super_admin', 'admin', 'editor', 'support'].includes(r)) ? '/panel/' : '/account')
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

  return (
    <div className="authm" role="dialog" aria-modal="true" aria-label="ورود یا ثبت‌نام">
      <div className="authm__backdrop" onClick={onClose} />
      <div className="authm__card" ref={dialogRef}>
        <button className="authm__close" onClick={onClose} aria-label="بستن">
          <X size={18} />
        </button>

        {(mode === 'login' || mode === 'register') && (
          <div className="authm__tabs" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'login'}
              className={mode === 'login' ? 'is-active' : ''}
              onClick={() => setMode('login')}
            >
              ورود
            </button>
            <button
              role="tab"
              aria-selected={mode === 'register'}
              className={mode === 'register' ? 'is-active' : ''}
              onClick={() => setMode('register')}
            >
              ثبت‌نام
            </button>
          </div>
        )}
        {mode === 'forgot' && <h2 className="authm__title">بازیابی رمز عبور</h2>}
        {mode === 'reset' && <h2 className="authm__title">تعیین رمز جدید</h2>}

        {notice && <p className="authm__notice">{notice}</p>}
        {err && <p className="authm__err" role="alert">{err}</p>}

        <form onSubmit={submit} className="authm__form">
          {mode === 'register' && (
            <label className="authm__field">
              <span>نام و نام خانوادگی</span>
              <input value={f.name} onChange={set('name')} required minLength={3} />
            </label>
          )}
          {mode !== 'reset' && (
            <label className="authm__field">
              <span>شماره موبایل</span>
              <input
                dir="ltr"
                inputMode="tel"
                placeholder="0912…"
                value={f.phone}
                onChange={set('phone')}
                required
              />
            </label>
          )}
          {(mode === 'login' || mode === 'register') && (
            <label className="authm__field">
              <span>رمز عبور {mode === 'register' && <em>(حداقل ۸ کاراکتر)</em>}</span>
              <input
                dir="ltr"
                type="password"
                value={f.password}
                onChange={set('password')}
                required
                minLength={mode === 'register' ? 8 : 1}
              />
            </label>
          )}
          {mode === 'register' && (
            <label className="authm__field">
              <span>کد معرف <em>(اختیاری)</em></span>
              <input dir="ltr" value={f.ref} onChange={set('ref')} placeholder="DN-XXXXXX" />
            </label>
          )}
          {mode === 'reset' && (
            <>
              <label className="authm__field">
                <span>کد بازیابی ارسال‌شده</span>
                <input dir="ltr" value={f.token} onChange={set('token')} required />
              </label>
              <label className="authm__field">
                <span>رمز جدید <em>(حداقل ۸ کاراکتر)</em></span>
                <input dir="ltr" type="password" value={f.newPassword} onChange={set('newPassword')} required minLength={8} />
              </label>
            </>
          )}
          <button className="btn btn--primary authm__submit" disabled={busy}>
            {busy
              ? '…'
              : mode === 'login'
                ? 'ورود به حساب'
                : mode === 'register'
                  ? 'ایجاد حساب'
                  : mode === 'forgot'
                    ? 'ارسال کد بازیابی'
                    : 'تغییر رمز و ورود مجدد'}
          </button>
        </form>

        {mode === 'login' && (
          <button className="authm__link" onClick={() => setMode('forgot')}>
            رمز عبور را فراموش کرده‌ام
          </button>
        )}
        {(mode === 'forgot' || mode === 'reset') && (
          <button className="authm__link" onClick={() => setMode('login')}>
            بازگشت به ورود
          </button>
        )}
      </div>
    </div>
  )
}
