import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { api } from '../../services/api'
import { readRefCookie } from '../../services/referral'

const FALLBACK_TOPICS = ['کیفری', 'خانواده', 'ملکی', 'قراردادها', 'مطالبات مالی / چک', 'سایر']
const CONTACT_PREFS = ['تماس تلفنی', 'پیامک / پیام‌رسان']

interface Created {
  id: string
  tracking_code: string
}

export default function NewRequestPage() {
  const [topics, setTopics] = useState<string[]>(FALLBACK_TOPICS)
  const [done, setDone] = useState<Created | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({
    topic: FALLBACK_TOPICS[0],
    title: '',
    body: '',
    phone: '',
    contact: CONTACT_PREFS[0],
    time: '',
    ref: readRefCookie(),
    terms: false,
    website: '', // honeypot
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const blur = (k: string) => () => setTouched((p) => ({ ...p, [k]: true }))

  // admin-managed topic list — static fallback when the API is unreachable
  useEffect(() => {
    api
      .get<string[]>('/public/legal-topics')
      .then((rows) => {
        if (rows.length > 0) {
          setTopics(rows)
          setF((p) => ({ ...p, topic: p.topic in rows ? p.topic : rows[0] }))
        }
      })
      .catch(() => {})
  }, [])

  const fieldErr = {
    title: touched.title && f.title.trim().length < 4 ? 'عنوان کوتاه است.' : '',
    body: touched.body && f.body.trim().length < 20 ? 'شرح مسئله باید حداقل ۲۰ حرف باشد.' : '',
    terms: touched.terms && !f.terms ? 'پذیرش قوانین الزامی است.' : '',
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.terms) {
      setTouched((p) => ({ ...p, terms: true }))
      return
    }
    setBusy(true)
    setErr('')
    const message = [
      f.title.trim() && `عنوان: ${f.title.trim()}`,
      f.body.trim(),
      `شیوهٔ تماس ترجیحی: ${f.contact}`,
      f.time.trim() && `زمان مناسب: ${f.time.trim()}`,
    ]
      .filter(Boolean)
      .join('\n')
    try {
      const out = await api.post<Created>('/account/requests', {
        topic: f.topic,
        message,
        phone: f.phone.trim(),
        ref_code: f.ref.trim().toUpperCase(),
      })
      setDone(out)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'ثبت ناموفق بود — دوباره تلاش کنید.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="acc__page">
        <div className="acc__card acc__success">
          <CheckCircle2 size={44} aria-hidden="true" />
          <h2>درخواست شما ثبت شد</h2>
          <p className="acc__muted">کد پیگیری را نگه دارید؛ کارشناسان به‌زودی پاسخ می‌دهند.</p>
          <code className="acc__track" dir="ltr">
            {done.tracking_code}
          </code>
          <div className="acc__success-actions">
            <Link to={`/panel/requests/${done.id}`} className="btn btn--primary">
              مشاهدهٔ درخواست
            </Link>
            <Link to="/panel/requests" className="btn btn--ghost">
              لیست درخواست‌ها
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="acc__page">
      <h1 className="acc__title">ثبت درخواست مشاوره</h1>
      <form className="acc__card acc__form" onSubmit={submit}>
        {err && <p className="acc__err">{err}</p>}

        <div className="acc__grid">
          <label className="acc__field">
            <span>نوع موضوع</span>
            <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })}>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="acc__field">
            <span>شیوهٔ تماس ترجیحی</span>
            <select value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })}>
              {CONTACT_PREFS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="acc__field">
          <span>عنوان کوتاه</span>
          <input
            value={f.title}
            onChange={(e) => setF({ ...f, title: e.target.value })}
            onBlur={blur('title')}
            aria-invalid={!!fieldErr.title}
            placeholder="مثلاً اختلاف بر سر مهریه"
            required
            minLength={4}
          />
          {fieldErr.title && <em className="acc__hint authp__hint--err">{fieldErr.title}</em>}
        </label>

        <label className="acc__field">
          <span>شرح مسئله</span>
          <textarea
            rows={5}
            value={f.body}
            onChange={(e) => setF({ ...f, body: e.target.value })}
            onBlur={blur('body')}
            aria-invalid={!!fieldErr.body}
            placeholder="مسئلهٔ حقوقی خود را به‌طور خلاصه بنویسید…"
            required
            minLength={20}
          />
          {fieldErr.body && <em className="acc__hint authp__hint--err">{fieldErr.body}</em>}
        </label>

        <div className="acc__grid">
          <label className="acc__field">
            <span>
              شمارهٔ تماس ترجیحی <em>(اختیاری)</em>
            </span>
            <input
              dir="ltr"
              inputMode="tel"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="همان شمارهٔ حساب شما"
            />
          </label>
          <label className="acc__field">
            <span>
              زمان مناسب تماس <em>(اختیاری)</em>
            </span>
            <input
              value={f.time}
              onChange={(e) => setF({ ...f, time: e.target.value })}
              placeholder="مثلاً عصرها"
            />
          </label>
        </div>

        <label className="acc__field" style={{ maxWidth: '16rem' }}>
          <span>
            کد معرف <em>(اختیاری)</em>
          </span>
          <input
            dir="ltr"
            value={f.ref}
            onChange={(e) => setF({ ...f, ref: e.target.value })}
            placeholder="DN-XXXXXX"
          />
        </label>

        {/* honeypot — مخفی از کاربر */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="acc__hp"
          value={f.website}
          onChange={(e) => setF({ ...f, website: e.target.value })}
        />

        <label className="authp__check">
          <input
            type="checkbox"
            checked={f.terms}
            onChange={(e) => setF({ ...f, terms: e.target.checked })}
            onBlur={blur('terms')}
          />
          <span>صحت اطلاعات را تأیید می‌کنم و قوانین حریم خصوصی را می‌پذیرم</span>
        </label>
        {fieldErr.terms && <em className="acc__hint authp__hint--err">{fieldErr.terms}</em>}

        <div className="acc__form-actions">
          <button className="btn btn--primary" disabled={busy}>
            {busy ? 'در حال ثبت…' : 'ثبت درخواست'}
          </button>
          <Link to="/panel/requests" className="acc__sitelink">
            انصراف
          </Link>
        </div>
      </form>
    </div>
  )
}
