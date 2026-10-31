import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Loader2, Send } from 'lucide-react'
import { Reveal } from '../components/Reveal'
import { trackPage as T } from '../content/lawyers.fa.js'
import { api } from '../services/api'
import { useSeo } from '../utils/seo'
import './pages.css'
import './TrackPage.css'

interface ThreadMessage {
  id: string
  sender_type: string
  body: string
  created_at: string
}

interface TrackResult {
  type: string
  code: string
  subject: string
  status: string
  created_at: string
  messages: ThreadMessage[]
}

const CLOSED = ['closed', 'cancelled', 'completed']

function fmt(iso: string) {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

/** Public request tracking — code + access-code (or phone) lookup. */
export function TrackPage() {
  useSeo('track', '/track')
  const [params] = useSearchParams()

  const [code, setCode] = useState(params.get('code') ?? '')
  const [credential, setCredential] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<TrackResult | null>(null)

  const [reply, setReply] = useState('')
  const [replyState, setReplyState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const lookup = async (c: string, cred: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await api.post<TrackResult>('/public/track', {
        code: c.trim(),
        credential: cred.trim(),
      })
      setResult(res)
    } catch (e) {
      setError(
        e instanceof Error && 'status' in e && (e as { status: number }).status === 404
          ? T.form.notFound
          : T.form.error
      )
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  // ?code=&access= deep-link (e.g. from the confirmation message)
  useEffect(() => {
    const c = params.get('code')
    const a = params.get('access')
    if (c && a) {
      setCode(c)
      setCredential(a)
      void lookup(c, a)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !credential.trim() || loading) return
    void lookup(code, credential)
  }

  const onReply = async (e: FormEvent) => {
    e.preventDefault()
    const body = reply.trim()
    if (!body || replyState === 'sending') return
    setReplyState('sending')
    try {
      const msg = await api.post<ThreadMessage>('/public/track/reply', {
        code: code.trim(),
        credential: credential.trim(),
        body,
      })
      setResult((r) => (r ? { ...r, messages: [...r.messages, msg] } : r))
      setReply('')
      setReplyState('sent')
      window.setTimeout(() => setReplyState('idle'), 3000)
    } catch {
      setReplyState('idle')
    }
  }

  const statusLabel = (T.detail.status as Record<string, string>)[result?.status ?? ''] ?? result?.status
  const typeLabel = (T.detail.type as Record<string, string>)[result?.type ?? ''] ?? result?.type
  const closed = result ? CLOSED.includes(result.status) : false

  return (
    <div className="page">
      <div className="container">
        <Reveal>
          <header className="page__head">
            <h1 className="page__title">{T.title}</h1>
            <p className="page__lead">{T.lead}</p>
          </header>
        </Reveal>

        <Reveal delay={120}>
          <div className="track">
            {/* lookup card */}
            <form className="track__lookup" onSubmit={onSubmit} noValidate>
              <div className="track__fields">
                <div className="track__field">
                  <label htmlFor="trk-code">{T.form.code}</label>
                  <input
                    id="trk-code"
                    type="text"
                    dir="ltr"
                    placeholder={T.form.codeHint}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="track__field">
                  <label htmlFor="trk-cred">{T.form.credential}</label>
                  <input
                    id="trk-cred"
                    type="text"
                    dir="ltr"
                    inputMode="tel"
                    placeholder={T.form.credentialHint}
                    value={credential}
                    onChange={(e) => setCredential(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
              {error ? (
                <p className="track__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="btn btn--primary track__submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 size={16} className="track__spin" aria-hidden="true" />
                    {T.form.searching}
                  </>
                ) : (
                  T.form.submit
                )}
              </button>
            </form>

            {/* result */}
            {result ? (
              <section className="track__result" aria-live="polite">
                <div className="track__head">
                  <div>
                    <p className="track__code" dir="ltr">
                      {result.code}
                    </p>
                    <h2 className="track__subject">{result.subject}</h2>
                  </div>
                  <span className="track__badge">{typeLabel}</span>
                </div>

                <dl className="track__meta">
                  <div>
                    <dt>{T.detail.statusHint}</dt>
                    <dd className="track__status">{statusLabel}</dd>
                  </div>
                  <div>
                    <dt>{T.detail.createdAt}</dt>
                    <dd>{fmt(result.created_at)}</dd>
                  </div>
                </dl>

                <div className="track__thread">
                  <h3 className="track__thread-title">{T.detail.threadTitle}</h3>
                  {result.messages.length === 0 ? (
                    <p className="track__empty">{T.detail.threadEmpty}</p>
                  ) : (
                    <ol className="track__msgs" role="list">
                      {result.messages.map((m) => (
                        <li
                          key={m.id}
                          className={`track__msg ${
                            m.sender_type === 'staff'
                              ? 'track__msg--staff'
                              : m.sender_type === 'assistant'
                                ? 'track__msg--staff track__msg--ai'
                                : 'track__msg--customer'
                          }`}
                        >
                          <p className="track__msg-who">
                            {m.sender_type === 'staff'
                              ? T.detail.fromOffice
                              : m.sender_type === 'assistant'
                                ? 'دستیار هوشمند'
                                : T.detail.fromYou}
                            <time>{fmt(m.created_at)}</time>
                          </p>
                          <p className="track__msg-body">{m.body}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                {closed ? (
                  <p className="track__closed">{T.detail.reply.closed}</p>
                ) : (
                  <form className="track__reply" onSubmit={onReply}>
                    <label htmlFor="trk-reply">{T.detail.reply.title}</label>
                    <textarea
                      id="trk-reply"
                      rows={3}
                      placeholder={T.detail.reply.placeholder}
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                    />
                    <div className="track__reply-row">
                      {replyState === 'sent' ? (
                        <span className="track__sent">{T.detail.reply.sent}</span>
                      ) : null}
                      <button
                        type="submit"
                        className="btn btn--primary"
                        disabled={!reply.trim() || replyState === 'sending'}
                      >
                        <Send size={14} aria-hidden="true" />
                        {replyState === 'sending' ? T.detail.reply.sending : T.detail.reply.submit}
                      </button>
                    </div>
                  </form>
                )}

                <button
                  type="button"
                  className="track__again"
                  onClick={() => {
                    setResult(null)
                    setError('')
                    setCredential('')
                  }}
                >
                  {T.detail.again}
                </button>
              </section>
            ) : null}
          </div>
        </Reveal>
      </div>
    </div>
  )
}
