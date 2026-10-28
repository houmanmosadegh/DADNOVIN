import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ClipboardCopy } from 'lucide-react'
import { consultationPage, services } from '../content/lawyers.fa.js'
import { api } from '../services/api'
import { isValidPhone } from '../utils/phone'
import './ConsultationForm.css'

const F = consultationPage.form

interface Errors {
  name?: string
  phone?: string
  service?: string
}

/**
 * Consultation request form — real client-side validation, submits to the
 * backend and also produces a copyable request summary. If the API is
 * unreachable the summary is still offered and the UI says so honestly.
 */
export function ConsultationForm() {
  // /consultation?service=<slug> (from a service detail CTA) preselects the topic
  const [params] = useSearchParams()
  const preselect = params.get('service') ?? ''
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [service, setService] = useState(
    services.some((s) => s.slug === preselect) ? preselect : '',
  )
  const [message, setMessage] = useState('')
  const [honey, setHoney] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [summary, setSummary] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState<boolean | null>(null)

  // a fresh ?service=slug while the form stays mounted (e.g. another CTA)
  // re-syncs the select — the useState initializer only covers first mount
  useEffect(() => {
    if (services.some((s) => s.slug === preselect)) setService(preselect)
  }, [preselect])

  const serviceTitle =
    service === 'other'
      ? F.fields.serviceOther
      : services.find((s) => s.slug === service)?.title ?? ''

  const buildSummary = () =>
    [
      `${F.fields.name}: ${name}`,
      `${F.fields.phone}: ${phone}`,
      `${F.fields.service}: ${serviceTitle}`,
      message.trim() ? `${F.fields.message}: ${message.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n')

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2400)
    } catch {
      setCopied(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Errors = {}
    if (name.trim().length < 2) next.name = F.errors.name
    if (!isValidPhone(phone)) next.phone = F.errors.phone
    if (!service) next.service = F.errors.service
    setErrors(next)
    if (Object.keys(next).length > 0) return
    const text = buildSummary()
    setSubmitting(true)
    try {
      // real submission — persisted server-side; the honeypot field is
      // forwarded so the backend can silently drop bot traffic
      await api.post('/consultations', {
        full_name: name.trim(),
        phone: phone.trim(),
        service_slug: service === 'other' ? '' : service,
        topic: service === 'other' ? F.fields.serviceOther : serviceTitle,
        message: message.trim(),
        source_page: '/consultation',
        website: honey,
      })
      setSent(true)
    } catch {
      // backend unreachable — keep the copyable summary honest about it
      setSent(false)
    } finally {
      setSubmitting(false)
      setSummary(text)
      void copy(text)
    }
  }

  if (summary !== null) {
    return (
      <div className="cform__result" role="status">
        <h2 className="cform__result-title">{F.readyTitle}</h2>
        {sent === true ? (
          <p className="cform__result-text">
            درخواست شما در سامانهٔ دفتر ثبت شد؛ برای پیگیری سریع‌تر می‌توانید با شماره‌های درج‌شده در صفحهٔ تماس در ارتباط باشید.
          </p>
        ) : (
          <p className="cform__result-text">
            ثبت آنلاین در این لحظه ممکن نشد — این خلاصه را هنگام تماس با دفتر در اختیار داشته باشید.
          </p>
        )}
        <pre className="cform__summary" dir="rtl">
          {summary}
        </pre>
        <div className="cform__result-actions">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void copy(summary)}
          >
            {copied ? <Check size={17} aria-hidden="true" /> : <ClipboardCopy size={17} aria-hidden="true" />}
            {copied ? F.copied : F.copyAction}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setSummary(null)}
          >
            {F.edit}
          </button>
          <Link to="/contact" className="cform__contact-link">
            {F.contactCta}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form className="cform" onSubmit={onSubmit} noValidate>
      {/* honeypot — invisible to humans, bots fill it and get dropped */}
      <div className="cform__hp" aria-hidden="true">
        <label htmlFor="cf-website">وب‌سایت</label>
        <input
          id="cf-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honey}
          onChange={(e) => setHoney(e.target.value)}
        />
      </div>

      <div className="cform__grid">
        <div className="cform__field cform__field--req">
          <label htmlFor="cf-name">{F.fields.name}</label>
          <input
            id="cf-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'cf-name-err' : undefined}
            autoComplete="name"
          />
          {errors.name ? (
            <p className="cform__error" id="cf-name-err" role="alert">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--req">
          <label htmlFor="cf-phone">{F.fields.phone}</label>
          <input
            id="cf-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="0912 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'cf-phone-err' : undefined}
            autoComplete="tel"
          />
          {errors.phone ? (
            <p className="cform__error" id="cf-phone-err" role="alert">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--wide cform__field--req">
          <label htmlFor="cf-service">{F.fields.service}</label>
          <select
            id="cf-service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            aria-invalid={Boolean(errors.service)}
            aria-describedby={errors.service ? 'cf-service-err' : undefined}
          >
            <option value="" disabled>
              {F.fields.service}
            </option>
            {services.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
            <option value="other">{F.fields.serviceOther}</option>
          </select>
          {errors.service ? (
            <p className="cform__error" id="cf-service-err" role="alert">
              {errors.service}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--wide">
          <label htmlFor="cf-message">{F.fields.message}</label>
          <textarea
            id="cf-message"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>

      <div className="cform__actions">
        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? 'در حال ارسال…' : F.fields.submit}
        </button>
      </div>
    </form>
  )
}
