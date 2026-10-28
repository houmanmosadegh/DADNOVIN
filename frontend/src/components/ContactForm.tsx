import { useState, type FormEvent } from 'react'
import { Check, ClipboardCopy } from 'lucide-react'
import { contactPage } from '../content/lawyers.fa.js'
import './ConsultationForm.css'

const F = contactPage.form
const PHONE_RE = /^(?:\+98|0)?9\d{9}$|^0\d{10}$/

interface Errors {
  name?: string
  phone?: string
  subject?: string
  message?: string
}

/**
 * Contact message form — a general note to the office (subject + message),
 * unlike the consultation form which requests a specific practice area.
 * No backend exists, so it never pretends to send: it composes a ready-to-copy
 * message summary the visitor can use when calling or emailing the office.
 */
export function ContactForm() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [honey, setHoney] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [summary, setSummary] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const subjectLabel =
    F.fields.subjects.find((s: { value: string; label: string }) => s.value === subject)
      ?.label ?? ''

  const buildSummary = () =>
    [
      `${F.fields.name}: ${name}`,
      `${F.fields.phone}: ${phone}`,
      `${F.fields.subject}: ${subjectLabel}`,
      `${F.fields.message}: ${message.trim()}`,
    ].join('\n')

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
    if (!subject) next.subject = F.errors.subject
    if (message.trim().length < 5) next.message = F.errors.message
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
        </div>
      </div>
    )
  }

  return (
    <form className="cform cform--contact" onSubmit={onSubmit} noValidate>
      {/* honeypot — invisible to humans, bots fill it and get dropped */}
      <div className="cform__hp" aria-hidden="true">
        <label htmlFor="cm-website">وب‌سایت</label>
        <input
          id="cm-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honey}
          onChange={(e) => setHoney(e.target.value)}
        />
      </div>

      <div className="cform__grid">
        <div className="cform__field cform__field--req">
          <label htmlFor="cm-name">{F.fields.name}</label>
          <input
            id="cm-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'cm-name-err' : undefined}
            autoComplete="name"
          />
          {errors.name ? (
            <p className="cform__error" id="cm-name-err" role="alert">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--req">
          <label htmlFor="cm-phone">{F.fields.phone}</label>
          <input
            id="cm-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            placeholder="0912 000 0000"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={errors.phone ? 'cm-phone-err' : undefined}
            autoComplete="tel"
          />
          {errors.phone ? (
            <p className="cform__error" id="cm-phone-err" role="alert">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--wide cform__field--req">
          <label htmlFor="cm-subject">{F.fields.subject}</label>
          <select
            id="cm-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-invalid={Boolean(errors.subject)}
            aria-describedby={errors.subject ? 'cm-subject-err' : undefined}
          >
            <option value="" disabled>
              {F.fields.subject}
            </option>
            {F.fields.subjects.map((s: { value: string; label: string }) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {errors.subject ? (
            <p className="cform__error" id="cm-subject-err" role="alert">
              {errors.subject}
            </p>
          ) : null}
        </div>

        <div className="cform__field cform__field--wide cform__field--req">
          <label htmlFor="cm-message">{F.fields.message}</label>
          <textarea
            id="cm-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={Boolean(errors.message)}
            aria-describedby={errors.message ? 'cm-message-err' : undefined}
          />
          {errors.message ? (
            <p className="cform__error" id="cm-message-err" role="alert">
              {errors.message}
            </p>
          ) : null}
        </div>
      </div>

      <div className="cform__actions">
        <button type="submit" className="btn btn--primary">
          {F.fields.submit}
        </button>
        <p className="cform__privacy">{F.privacy}</p>
      </div>
    </form>
  )
}
