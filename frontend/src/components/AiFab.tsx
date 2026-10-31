import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import { aiConsultant } from '../content/lawyers.fa.js'
import { siteFlags } from '../content/remote'
import { api } from '../services/api'
import './AiFab.css'

type Msg = { id: number; from: 'ai' | 'user'; text: string }

const SESSION_KEY = 'dn_ai_session'
/**
 * Public AI consultant is not wired to the backend yet — the panel renders
 * a «به‌زودی» state. Flip to true once /ai/chat is ready for the public site;
 * the chat flow (send(), session key, message list) is already in place.
 */
const AI_LIVE = false

/**
 * Floating AI-consultant button + chat panel — backed by the site's
 * knowledge-grounded assistant. When the API is unreachable it answers
 * with the honest canned reply pointing at the consultation form.
 */
export function AiFab() {
  const c = aiConsultant.chat
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const sessionKey = useRef('')
  const nextId = useRef(1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      sessionKey.current = localStorage.getItem(SESSION_KEY) ?? ''
    } catch {
      /* private mode */
    }
  }, [])

  useEffect(() => {
    if (!open) return
    if (AI_LIVE) inputRef.current?.focus()
    if (msgs.length === 0) setMsgs([{ id: nextId.current++, from: 'ai', text: c.welcome }])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgs])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = async () => {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setMsgs((m) => [...m, { id: nextId.current++, from: 'user', text }])
    try {
      const res = await api.post<{ reply: string; session_key: string }>(
        '/ai/chat',
        {
          session_key: sessionKey.current,
          messages: [{ role: 'user', content: text }],
        },
      )
      sessionKey.current = res.session_key
      try {
        localStorage.setItem(SESSION_KEY, res.session_key)
      } catch {
        /* private mode */
      }
      setMsgs((m) => [...m, { id: nextId.current++, from: 'ai', text: res.reply }])
    } catch {
      // offline/API down — honest canned fallback, not a fake AI answer
      setMsgs((m) => [...m, { id: nextId.current++, from: 'ai', text: c.reply }])
    } finally {
      setBusy(false)
    }
  }

  if (!siteFlags.aiEnabled) return null

  return (
    <>
      <button
        type="button"
        className={`ai-fab${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? c.close : aiConsultant.label}
        title={aiConsultant.hint}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? (
          <X size={22} strokeWidth={1.8} aria-hidden="true" />
        ) : (
          <picture>
            <source type="image/webp" srcSet={aiConsultant.img} />
            <img className="ai-fab__img" src={aiConsultant.imgFallback} width="64" height="64" alt="" />
          </picture>
        )}
        <span className="ai-fab__label">{open ? c.close : aiConsultant.label}</span>
      </button>

      {open ? (
        <div className="ai-chat" role="dialog" aria-label={c.title}>
          <header className="ai-chat__head">
            <picture>
              <source type="image/webp" srcSet={aiConsultant.img} />
              <img className="ai-chat__avatar" src={aiConsultant.imgFallback} width="40" height="40" alt="" />
            </picture>
            <div className="ai-chat__id">
              <b>{c.title}</b>
              <span className="ai-chat__status" data-off={!AI_LIVE || undefined}>
                <i aria-hidden="true" />
                {c.status}
              </span>
            </div>
            <button
              type="button"
              className="ai-chat__close"
              aria-label={c.close}
              onClick={() => setOpen(false)}
            >
              <X size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </header>

          <div className="ai-chat__list" ref={listRef} data-lenis-prevent>
            {AI_LIVE ? (
              <>
                {msgs.map((m) => (
                  <p key={m.id} className={`ai-chat__msg ai-chat__msg--${m.from}`}>
                    {m.text}
                  </p>
                ))}
                {busy ? (
                  <p
                    className="ai-chat__msg ai-chat__msg--ai ai-chat__msg--typing"
                    aria-live="polite"
                  >
                    …
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <p className="ai-chat__msg ai-chat__msg--ai">{c.welcome}</p>
                <p className="ai-chat__soon" aria-hidden="true">
                  {c.soon}
                </p>
              </>
            )}
            <Link className="ai-chat__cta" to={aiConsultant.to} onClick={() => setOpen(false)}>
              {c.cta}
            </Link>
          </div>

          <div className="ai-chat__composer" data-disabled={!AI_LIVE || undefined}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={c.placeholder}
              aria-label={c.placeholder}
              disabled={!AI_LIVE}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
            />
            <button
              type="button"
              className="ai-chat__send"
              aria-label={c.send}
              disabled={!AI_LIVE || !draft.trim()}
              onClick={send}
            >
              <Send size={17} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
