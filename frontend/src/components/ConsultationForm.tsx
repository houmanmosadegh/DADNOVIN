import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, ClipboardCopy } from 'lucide-react'
import { consultationPage, services } from '../content/lawyers.fa.js'
import './ConsultationForm.css'

const F = consultationPage.form
const PHONE_RE = /^(?:\+98|0)?9\d{9}$|^0\d{10}$/

interface Errors {
  name?: string
  phone?: string
  service?: string
}

/**
 * Consultation request form — real client-side validation; on success it
 * composes a request summary and copies it to the clipboard. There is no
 * backend, so it never pretends to "send" anything.
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (honey) return // honeypot tripped — silently drop the bot submission
    const next: Errors = {}
    if (name.trim().length < 2) next.name = F.errors.name
    if (!PHONE_RE.test(phone.replace(/[\s-]/g, ''))) next.phone = F.errors.phone
    if (!service) next.service = F.errors.service
    setErrors(next)
    if (Object.keys(next).length > 0) return
    const text = buildSummary()
    setSummary(text)
    void copy(text)
  }

  if (summary !== null) {
    return (
      <div className="cform__result" role="status">
        <h2 className="cform__result-title">{F.readyTitle}</h2>
        <p className="cform__result-text">{F.readyText}</p>
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
        <button type="submit" className="btn btn--primary">
          {F.fields.submit}
        </button>
      </div>
    </form>
  )
}
