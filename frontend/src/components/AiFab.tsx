import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, X } from 'lucide-react'
import { aiConsultant } from '../content/lawyers.fa.js'
import './AiFab.css'

type Msg = { id: number; from: 'ai' | 'user'; text: string }

/**
 * Floating AI-consultant button + chat panel — UI only, no backend.
 * Every sent message gets one honest canned reply pointing at the real
 * consultation form; nothing pretends an AI answered.
 */
export function AiFab() {
  const c = aiConsultant.chat
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const nextId = useRef(1)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
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

  const send = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    setMsgs((m) => [...m, { id: nextId.current++, from: 'user', text }])
    window.setTimeout(
      () => setMsgs((m) => [...m, { id: nextId.current++, from: 'ai', text: c.reply }]),
      600,
    )
  }

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
          <img className="ai-fab__img" src={aiConsultant.img} width="64" height="64" alt="" />
        )}
        <span className="ai-fab__label">{open ? c.close : aiConsultant.label}</span>
      </button>

      {open ? (
        <div className="ai-chat" role="dialog" aria-label={c.title}>
          <header className="ai-chat__head">
            <img className="ai-chat__avatar" src={aiConsultant.img} width="40" height="40" alt="" />
            <div className="ai-chat__id">
              <b>{c.title}</b>
              <span className="ai-chat__status">
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
            {msgs.map((m) => (
              <p key={m.id} className={`ai-chat__msg ai-chat__msg--${m.from}`}>
                {m.text}
              </p>
            ))}
            <Link className="ai-chat__cta" to={aiConsultant.to} onClick={() => setOpen(false)}>
              {c.cta}
            </Link>
          </div>

          <div className="ai-chat__composer">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              placeholder={c.placeholder}
              aria-label={c.placeholder}
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
              disabled={!draft.trim()}
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
