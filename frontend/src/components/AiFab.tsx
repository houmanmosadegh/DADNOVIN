import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import { aiConsultant } from '../content/lawyers.fa.js'
import { siteFlags } from '../content/remote'
import { api } from '../services/api'
import './AiFab.css'

type Msg = { id: number; from: 'ai' | 'user'; text: string }

const SESSION_KEY = 'dn_ai_session'
/** /ai/chat streams SSE deltas — the panel appends them as they arrive. */
const AI_LIVE = true

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
    const history = msgs
      .slice(-10)
      .map((m) => ({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text }))
    setMsgs((m) => [...m, { id: nextId.current++, from: 'user', text }])
    const aiId = nextId.current++
    let started = false
    const push = (t: string) => {
      if (!started) {
        started = true
        setMsgs((m) => [...m, { id: aiId, from: 'ai', text: t }])
      } else {
        setMsgs((m) => m.map((x) => (x.id === aiId ? { ...x, text: x.text + t } : x)))
      }
    }
    try {
      const res = await api.postStream('/ai/chat', {
        session_key: sessionKey.current,
        messages: [...history, { role: 'user', content: text }],
      })
      if (!res.ok || !res.body) throw new Error(`http ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        let i = buf.indexOf('\n\n')
        while (i >= 0) {
          const block = buf.slice(0, i)
          buf = buf.slice(i + 2)
          for (const line of block.split('\n')) {
            if (!line.startsWith('data:')) continue
            try {
              const ev = JSON.parse(line.slice(5).trim())
              if (ev.type === 'meta') {
                sessionKey.current = ev.session_key
                try {
                  localStorage.setItem(SESSION_KEY, ev.session_key)
                } catch {
                  /* private mode */
                }
              } else if (ev.type === 'delta') {
                push(ev.text)
              } else if (ev.type === 'error') {
                push(started ? `\n\n${ev.message}` : ev.message)
              }
            } catch {
              /* malformed event line — skip */
            }
          }
          i = buf.indexOf('\n\n')
        }
      }
      if (!started) throw new Error('empty stream')
    } catch {
      // offline/API down — honest canned fallback, not a fake AI answer
      if (!started) setMsgs((m) => [...m, { id: aiId, from: 'ai', text: c.reply }])
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
                  <p className="ai-chat__msg ai-chat__msg--ai ai-chat__msg--typing" aria-live="polite">
                    …
                  </p>
                ) : null}
              </>
            ) : (
              <p className="ai-chat__msg ai-chat__msg--ai">{c.welcome}</p>
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
