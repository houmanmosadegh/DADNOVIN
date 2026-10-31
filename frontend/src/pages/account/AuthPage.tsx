/** صفحهٔ ورود/ثبت‌نام — یک کارت مرکزی مینیمال (سبک اینستاگرام).
 *  گیتِ /panel؛ بعد از ورود ریدایرکت نقش‌محور (یا ?next=). */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { api, apiAsset } from '../../services/api'
import { useAuth } from '../../services/auth'
import { readRefCookie } from '../../services/referral'
import { brand } from '../../content/lawyers.fa.js'

type Mode = 'login' | 'register' | 'forgot' | 'reset'

const faToEn = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))

const STAFF = ['super_admin', 'admin', 'editor', 'support']

const strength = (pw: string): 0 | 1 | 2 | 3 => {
  if (pw.length < 8) return 0
  let s = 1
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1
  if (/\d/.test(pw) || /[^\w\s]/.test(pw)) s += 1
  return s as 1 | 2 | 3
}
const STRENGTH_FA = ['خیلی ضعیف', 'ضعیف', 'متوسط', 'قوی']

export default function AuthPage() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [mode, setMode] = useState<Mode>('login')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showRef, setShowRef] = useState(!!readRefCookie())
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [f, setF] = useState({
    name: '',
    username: '',
    phone: '',
    password: '',
    ref: readRefCookie(),
    token: '',
    newPassword: '',
    otp: '',
  })
  const firstRef = useRef<HTMLInputElement>(null)

  // OTP feature flag — the field only renders when admin enables it
  const [otpEnabled, setOtpEnabled] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  useEffect(() => {
    api
      .get<{ otp_enabled: boolean }>('/account-auth/config')
      .then((c) => setOtpEnabled(c.otp_enabled))
      .catch(() => {})
  }, [])

  // live username availability — debounced probe against the same rules
  // RegisterIn enforces server-side
  const [uState, setUState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'bad'>('idle')
  useEffect(() => {
    const u = f.username.trim().toLowerCase()
    if (mode !== 'register' || !u) return setUState('idle')
    if (!/^[a-z0-9_]{3,24}$/.test(u)) return setUState('bad')
    setUState('checking')
    const t = setTimeout(() => {
      api
        .get<{ available: boolean }>(`/account-auth/check-username?u=${encodeURIComponent(u)}`)
        .then((r) => setUState(r.available ? 'ok' : 'taken'))
        .catch(() => setUState('idle'))
    }, 400)
    return () => clearTimeout(t)
  }, [f.username, mode])

  const { pathname } = useLocation()
  const next = params.get('next')
  // مسیر محافظت‌دار فعلی هم به‌عنوان مقصد برگشت حساب می‌شود
  const safeNext =
    next && next.startsWith('/') && !next.startsWith('//') ? next : pathname !== '/panel' ? pathname : null

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const blur = (k: string) => () => setTouched((p) => ({ ...p, [k]: true }))

  const go = (m: Mode) => {
    setMode(m)
    setErr('')
    setNotice('')
    setTouched({})
    setTimeout(() => firstRef.current?.focus(), 50)
  }

  const done = (me: { roles: string[] }) => {
    const dest = safeNext ?? (me.roles.some((r) => STAFF.includes(r)) ? '/admin/' : '/panel')
    // /admin اپ جداست — ناوبری سخت؛ مسیرهای داخلی نرم
    if (dest.startsWith('/admin')) window.location.assign(dest)
    else navigate(dest, { replace: true })
  }

  /* ── اعتبارسنجی آرام (روی blur) ── */
  const fieldErr = useMemo(() => {
    const phone = faToEn(f.phone.trim())
    const out: Record<string, string> = {}
    if (mode !== 'reset' && touched.phone) {
      if (mode === 'login') {
        if (!phone) out.phone = 'شماره موبایل یا نام کاربری را وارد کنید.'
      } else if (!/^09\d{9}$/.test(phone)) {
        out.phone = 'شماره موبایل معتبر نیست (مثل 0912…).'
      }
    }
    if (mode === 'register' && touched.name && f.name.trim().length < 3) out.name = 'نام کامل را وارد کنید.'
    if (mode === 'register' && touched.username) {
      if (!/^[a-z0-9_]{3,24}$/.test(f.username.trim().toLowerCase()))
        out.username = 'حروف لاتین کوچک، عدد یا _ — ۳ تا ۲۴ کاراکتر.'
      else if (uState === 'taken') out.username = 'این نام کاربری گرفته شده است.'
    }
    if (mode === 'register' && touched.password && f.password.length < 8)
      out.password = 'رمز عبور باید حداقل ۸ کاراکتر باشد.'
    return out
  }, [f, mode, touched, uState])

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
            username: f.username.trim().toLowerCase(),
            phone,
            password: f.password,
            ref_code: f.ref.trim().toUpperCase(),
            otp: f.otp.trim(),
          })
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

  const inTabs = mode === 'login' || mode === 'register'
  const pwStrength = strength(f.password)

  return (
    <div className="authp">
      <div className="authp__card">
        <a className="authp__back" href="/">
          <ArrowLeft size={14} /> بازگشت به سایت
        </a>

        <header className="authp__head">
          <img
            className="authp__logo"
            src={apiAsset(brand.logoMark)}
            alt=""
            width={52}
            height={41}
            decoding="async"
          />
          <h1 className="authp__name">دادنوین</h1>
          <p className="authp__sub">{mode === 'register' ? 'ساخت حساب کاربری' : 'به پنل کاربری خوش آمدید'}</p>
        </header>

        {inTabs && (
          <div className="authp__tabs" role="tablist" aria-label="ورود یا ثبت‌نام">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'is-active' : ''}
                onClick={() => go(m)}
              >
                {m === 'login' ? 'ورود' : 'ثبت‌نام'}
              </button>
            ))}
          </div>
        )}
        {mode === 'forgot' && <h2 className="authp__title">بازیابی رمز عبور</h2>}
        {mode === 'reset' && <h2 className="authp__title">تعیین رمز جدید</h2>}

        {notice && (
          <p className="authp__notice" role="status">
            <CheckCircle2 size={15} /> {notice}
          </p>
        )}
        {err && (
          <p className="authp__err" role="alert">
            <AlertCircle size={15} /> {err}
          </p>
        )}

        <form key={mode} onSubmit={submit} className="authp__form" noValidate>
          {mode === 'register' && (
            <>
              <div className="authp__field">
                <input
                  ref={firstRef}
                  autoComplete="name"
                  placeholder="نام و نام خانوادگی"
                  value={f.name}
                  onChange={set('name')}
                  onBlur={blur('name')}
                  aria-invalid={!!fieldErr.name}
                />
                {fieldErr.name && <em className="authp__hint authp__hint--err">{fieldErr.name}</em>}
              </div>
              <div className="authp__field">
                <input
                  dir="ltr"
                  autoComplete="username"
                  placeholder="نام کاربری (لاتین — مثل ali_law)"
                  value={f.username}
                  onChange={set('username')}
                  onBlur={blur('username')}
                  aria-invalid={!!fieldErr.username}
                  aria-describedby="uname-hint"
                />
                <em
                  id="uname-hint"
                  className={`authp__hint${uState === 'ok' ? ' authp__hint--ok' : ''}${fieldErr.username ? ' authp__hint--err' : ''}`}
                >
                  {uState === 'checking' && <Loader2 size={11} className="authp__spin-inline" />}
                  {fieldErr.username ??
                    (uState === 'checking'
                      ? 'در حال بررسی…'
                      : uState === 'ok'
                        ? 'نام کاربری آزاد است ✓'
                        : uState === 'bad'
                          ? 'حروف لاتین کوچک، عدد یا _ — ۳ تا ۲۴ کاراکتر.'
                          : '')}
                </em>
              </div>
            </>
          )}

          {mode !== 'reset' && (
            <div className="authp__field">
              <input
                ref={mode === 'register' ? undefined : firstRef}
                dir="ltr"
                inputMode={mode === 'login' ? 'text' : 'tel'}
                autoComplete={mode === 'login' ? 'username' : 'tel'}
                placeholder={mode === 'login' ? 'شماره موبایل یا نام کاربری' : 'شماره موبایل'}
                value={f.phone}
                onChange={set('phone')}
                onBlur={blur('phone')}
                aria-invalid={!!fieldErr.phone}
              />
              {fieldErr.phone && <em className="authp__hint authp__hint--err">{fieldErr.phone}</em>}
            </div>
          )}

          {inTabs && (
            <div className="authp__field">
              <div className="authp__pw">
                <input
                  dir="ltr"
                  type={showPw ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="رمز عبور"
                  value={f.password}
                  onChange={set('password')}
                  onBlur={blur('password')}
                  aria-invalid={!!fieldErr.password}
                />
                <button
                  type="button"
                  className="authp__eye"
                  aria-label={showPw ? 'مخفی کردن رمز' : 'نمایش رمز'}
                  aria-pressed={showPw}
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {mode === 'register' && f.password.length > 0 && (
                <div className="authp__meter" aria-hidden="true">
                  <span className={`authp__meter-fill authp__meter-fill--${pwStrength}`} />
                  <em className="authp__hint">{STRENGTH_FA[pwStrength]}</em>
                </div>
              )}
              {fieldErr.password && <em className="authp__hint authp__hint--err">{fieldErr.password}</em>}
            </div>
          )}

          {mode === 'register' && otpEnabled && (
            <div className="authp__field">
              <div className="authp__pw">
                <input
                  dir="ltr"
                  inputMode="numeric"
                  placeholder="کد تأیید پیامکی"
                  autoComplete="one-time-code"
                  value={f.otp}
                  onChange={set('otp')}
                />
                <button
                  type="button"
                  className="authp__eye authp__otp-btn"
                  disabled={busy || otpSent}
                  onClick={async () => {
                    try {
                      await api.post('/account-auth/otp/request', {
                        phone: faToEn(f.phone.trim()),
                      })
                      setOtpSent(true)
                      setNotice('کد تأیید پیامک شد.')
                    } catch (ex) {
                      setErr(ex instanceof Error ? ex.message : 'خطا در ارسال کد.')
                    }
                  }}
                >
                  {otpSent ? 'ارسال شد' : 'دریافت کد'}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' &&
            (showRef ? (
              <div className="authp__field">
                <input dir="ltr" placeholder="کد معرف" value={f.ref} onChange={set('ref')} />
              </div>
            ) : (
              <button
                type="button"
                className="authp__link authp__link--start"
                onClick={() => setShowRef(true)}
              >
                کد معرف دارم
              </button>
            ))}

          {mode === 'reset' && (
            <>
              <div className="authp__field">
                <input
                  ref={firstRef}
                  dir="ltr"
                  placeholder="کد بازیابی ارسال‌شده"
                  value={f.token}
                  onChange={set('token')}
                  required
                />
              </div>
              <div className="authp__field">
                <input
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  placeholder="رمز جدید (حداقل ۸ کاراکتر)"
                  value={f.newPassword}
                  onChange={set('newPassword')}
                  required
                  minLength={8}
                />
              </div>
            </>
          )}

          <button className="authp__submit" disabled={busy}>
            {busy && <span className="authp__spin" aria-hidden="true" />}
            {busy
              ? 'لطفاً صبر کنید…'
              : mode === 'login'
                ? 'ورود'
                : mode === 'register'
                  ? 'ایجاد حساب'
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
          {!inTabs && (
            <button className="authp__link" onClick={() => go('login')}>
              بازگشت به ورود
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
