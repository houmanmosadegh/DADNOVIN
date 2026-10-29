/** پنل کاربر — داشبورد، درخواست‌ها، اعلان‌ها، بازاریابی، پروفایل.
 *  Client-only authenticated page (lazy-loaded, not prerendered). */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Copy,
  FileText,
  LayoutDashboard,
  LogOut,
  Share2,
  UserRound,
  Wallet,
} from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import './AccountPage.css'

/* ─── types ─────────────────────────────────────────────────── */

interface MyRequest {
  id: string
  tracking_code: string
  topic: string
  status: string
  created_at: string
}

interface RequestDetail extends MyRequest {
  messages: { id: string; sender_type: string; body: string; created_at: string }[]
}

interface Notif {
  id: string
  title: string
  body: string
  kind: string
  link: string
  read: boolean
  created_at: string
}

interface MarketerHome {
  status: string
  ref_code?: string
  ref_link?: string
  is_active?: boolean
  commission_enabled?: boolean
  cookie_days?: number
  stats?: { clicks: number; requests: number; accepted: number; conversion: number }
  iban_masked?: string
}

interface WalletView {
  balance: number
  pending_commissions: number
  pending_payouts: number
  min_payout: number
  commission_enabled: boolean
  entries: { id: string; kind: string; amount: number; memo: string; created_at: string }[]
}

interface Referral {
  masked_name: string
  status: string
  created_at: string
}

interface Payout {
  id: string
  amount: number
  status: string
  iban_masked: string
  payment_ref: string
  created_at: string
}

const STATUS_FA: Record<string, string> = {
  new: 'جدید', reviewing: 'در حال بررسی', awaiting_call: 'در انتظار تماس',
  followed_up: 'پیگیری شد', consulted: 'مشاوره انجام شد', accepted: 'پرونده پذیرفته شد',
  rejected: 'رد شد', completed: 'تکمیل شد', cancelled: 'لغو شد',
}

const faDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' })
const faDateTime = (iso: string) =>
  new Date(iso).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })
const rial = (n: number) => `${n.toLocaleString('fa-IR')} ریال`

/* ─── page ──────────────────────────────────────────────────── */

type Tab = 'dash' | 'requests' | 'notifs' | 'marketing' | 'profile'

export default function AccountPage() {
  const { me, loading, logout, refresh } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('dash')

  if (loading) {
    return <div className="acct acct--center"><p className="acct__muted">…</p></div>
  }
  if (!me) {
    return (
      <div className="acct acct--center">
        <div className="acct__card acct__login-prompt">
          <UserRound size={34} aria-hidden="true" />
          <h1>ورود به حساب کاربری</h1>
          <p className="acct__muted">
            برای مشاهدهٔ درخواست‌ها و پنل خود از دکمهٔ «ورود / ثبت‌نام» در سربرگ استفاده کنید.
          </p>
          <Link to="/" className="btn btn--primary">بازگشت به صفحهٔ اصلی</Link>
        </div>
      </div>
    )
  }

  const isStaff = me.roles.some((r) => ['super_admin', 'admin', 'editor', 'support'].includes(r))

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'dash', label: 'داشبورد', icon: <LayoutDashboard size={16} /> },
    { key: 'requests', label: 'درخواست‌های من', icon: <FileText size={16} /> },
    { key: 'notifs', label: 'اعلان‌ها', icon: <Bell size={16} /> },
    { key: 'marketing', label: 'بازاریابی', icon: <Share2 size={16} /> },
    { key: 'profile', label: 'پروفایل', icon: <UserRound size={16} /> },
  ]

  return (
    <div className="acct">
      <header className="acct__head">
        <div>
          <h1>سلام، {me.full_name}</h1>
          <p className="acct__muted" dir="ltr">{me.phone}</p>
        </div>
        <button className="btn btn--ghost acct__logout" onClick={() => void logout().then(() => navigate('/'))}>
          <LogOut size={15} /> خروج
        </button>
      </header>

      {isStaff && (
        <p className="acct__staff-note">
          شما عضو تیم هستید — <a href="/panel/">ورود به پنل مدیریت ←</a>
        </p>
      )}

      <nav className="acct__tabs" aria-label="بخش‌های پنل">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? 'is-active' : ''}
            onClick={() => setTab(t.key)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {tab === 'dash' && <Dash setTab={setTab} />}
      {tab === 'requests' && <Requests />}
      {tab === 'notifs' && <Notifs />}
      {tab === 'marketing' && <Marketing me={me} onChanged={refresh} />}
      {tab === 'profile' && <Profile onChanged={refresh} />}
    </div>
  )
}

/* ─── dashboard ─────────────────────────────────────────────── */

function Dash({ setTab }: { setTab: (t: Tab) => void }) {
  const [rows, setRows] = useState<MyRequest[]>([])
  const [notifs, setNotifs] = useState<Notif[]>([])
  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => {})
    api.get<Notif[]>('/account/notifications').then(setNotifs).catch(() => {})
  }, [])
  const open = rows.filter((r) => !['completed', 'cancelled', 'rejected'].includes(r.status))
  const unread = notifs.filter((n) => !n.read)

  return (
    <div className="acct__grid">
      <div className="acct__card acct__stat" onClick={() => setTab('requests')} role="button" tabIndex={0}>
        <p className="acct__stat-num">{rows.length.toLocaleString('fa-IR')}</p>
        <p className="acct__muted">کل درخواست‌ها</p>
      </div>
      <div className="acct__card acct__stat">
        <p className="acct__stat-num">{open.length.toLocaleString('fa-IR')}</p>
        <p className="acct__muted">در جریان</p>
      </div>
      <div className="acct__card acct__stat" onClick={() => setTab('notifs')} role="button" tabIndex={0}>
        <p className="acct__stat-num">{unread.length.toLocaleString('fa-IR')}</p>
        <p className="acct__muted">اعلان خوانده‌نشده</p>
      </div>
      <div className="acct__card">
        <h2>ثبت درخواست جدید</h2>
        <p className="acct__muted">از فرم مشاورهٔ سایت درخواست بفرستید — با همین شماره به حساب شما متصل می‌شود.</p>
        <Link to="/consultation" className="btn btn--primary">فرم مشاوره</Link>
      </div>
    </div>
  )
}

/* ─── requests ──────────────────────────────────────────────── */

function Requests() {
  const [rows, setRows] = useState<MyRequest[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RequestDetail | null>(null)
  const [reply, setReply] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    api.get<MyRequest[]>('/account/requests').then(setRows).catch(() => setRows([]))
  }, [])

  const openDetail = (id: string) => {
    setOpenId(id)
    setDetail(null)
    api.get<RequestDetail>(`/account/requests/${id}`).then(setDetail).catch(() => setErr('خطا در بارگذاری'))
  }

  const send = async () => {
    if (!openId || !reply.trim()) return
    try {
      await api.post(`/account/requests/${openId}/reply`, { body: reply.trim() })
      setReply('')
      openDetail(openId)
    } catch {
      setErr('ارسال ناموفق بود.')
    }
  }

  if (!rows) return <p className="acct__muted">در حال بارگذاری…</p>
  if (rows.length === 0)
    return (
      <div className="acct__card acct__empty">
        <p>هنوز درخواستی ثبت نکرده‌اید.</p>
        <Link to="/consultation" className="btn btn--primary">ثبت درخواست مشاوره</Link>
      </div>
    )

  if (openId) {
    return (
      <div className="acct__card">
        <button className="acct__back" onClick={() => setOpenId(null)}>→ بازگشت به لیست</button>
        {!detail ? (
          <p className="acct__muted">در حال بارگذاری…</p>
        ) : (
          <>
            <h2>{detail.tracking_code} <span className={`acct__badge acct__badge--${detail.status}`}>{STATUS_FA[detail.status] ?? detail.status}</span></h2>
            <p className="acct__muted">{detail.topic} · {faDateTime(detail.created_at)}</p>
            <div className="acct__thread">
              {detail.messages.map((m) => (
                <div key={m.id} className={`acct__msg acct__msg--${m.sender_type}`}>
                  <p>{m.body}</p>
                  <span>{faDateTime(m.created_at)} · {m.sender_type === 'staff' ? 'کارشناس' : m.sender_type === 'assistant' ? 'دستیار هوشمند' : 'شما'}</span>
                </div>
              ))}
            </div>
            <div className="acct__reply">
              <textarea
                rows={3}
                placeholder="پاسخ شما…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <button className="btn btn--primary" disabled={!reply.trim()} onClick={send}>ارسال</button>
            </div>
          </>
        )}
        {err && <p className="acct__err">{err}</p>}
      </div>
    )
  }

  return (
    <div className="acct__list">
      {rows.map((r) => (
        <button key={r.id} className="acct__row" onClick={() => openDetail(r.id)}>
          <span dir="ltr" className="acct__code">{r.tracking_code}</span>
          <span className="acct__row-topic">{r.topic || '—'}</span>
          <span className={`acct__badge acct__badge--${r.status}`}>{STATUS_FA[r.status] ?? r.status}</span>
          <span className="acct__muted">{faDate(r.created_at)}</span>
        </button>
      ))}
    </div>
  )
}

/* ─── notifications ─────────────────────────────────────────── */

function Notifs() {
  const [rows, setRows] = useState<Notif[] | null>(null)
  useEffect(() => {
    api.get<Notif[]>('/account/notifications').then(setRows).catch(() => setRows([]))
  }, [])
  const mark = (n: Notif) => {
    if (n.read) return
    void api.post(`/account/notifications/${n.id}/read`, {}).then(() =>
      setRows((p) => p?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? p),
    )
  }
  if (!rows) return <p className="acct__muted">در حال بارگذاری…</p>
  if (rows.length === 0) return <div className="acct__card acct__empty"><p>اعلانی ندارید.</p></div>
  return (
    <div className="acct__list">
      {rows.map((n) => (
        <button key={n.id} className={`acct__row acct__notif${n.read ? '' : ' is-unread'}`} onClick={() => mark(n)}>
          <span className="acct__notif-body">
            <strong>{n.title}</strong>
            {n.body && <span className="acct__muted">{n.body}</span>}
          </span>
          <span className="acct__muted">{faDate(n.created_at)}</span>
        </button>
      ))}
    </div>
  )
}

/* ─── marketing ─────────────────────────────────────────────── */

function Marketing({ me, onChanged }: { me: { is_marketer: boolean; marketer_status: string }; onChanged: () => Promise<void> }) {
  const [home, setHome] = useState<MarketerHome | null>(null)
  const [refs, setRefs] = useState<Referral[]>([])
  const [wallet, setWallet] = useState<WalletView | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [applyNote, setApplyNote] = useState('')
  const [amount, setAmount] = useState('')
  const [iban, setIban] = useState('')
  const [msg, setMsg] = useState('')
  const isMarketer = me.is_marketer

  useEffect(() => {
    api.get<MarketerHome>('/account/marketer').then(setHome).catch(() => setHome({ status: 'none' }))
  }, [isMarketer])
  useEffect(() => {
    if (!isMarketer) return
    api.get<Referral[]>('/account/marketer/referrals').then(setRefs).catch(() => {})
    api.get<WalletView>('/account/wallet').then(setWallet).catch(() => {})
    api.get<Payout[]>('/account/payouts').then(setPayouts).catch(() => {})
  }, [isMarketer])

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setMsg('کپی شد'))
  }

  const apply = async () => {
    try {
      await api.post('/account/marketer/apply', { note: applyNote })
      setMsg('درخواست شما ثبت شد؛ پس از تأیید مدیریت فعال می‌شود.')
      await onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }

  const saveBank = async () => {
    try {
      await api.post('/account/marketer/bank', { iban, card: '' })
      setMsg('شماره شبا ذخیره شد.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }

  const requestPayout = async () => {
    try {
      await api.post('/account/payouts', { amount: parseInt(amount.replace(/,/g, ''), 10) })
      setMsg('درخواست برداشت ثبت شد.')
      setAmount('')
      api.get<Payout[]>('/account/payouts').then(setPayouts).catch(() => {})
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }

  if (!home) return <p className="acct__muted">در حال بارگذاری…</p>

  if (!isMarketer) {
    return (
      <div className="acct__card">
        <h2><Share2 size={17} /> درخواست بازاریاب شدن</h2>
        {home.status === 'pending' ? (
          <p className="acct__muted">درخواست شما در انتظار بررسی مدیریت است.</p>
        ) : home.status === 'rejected' ? (
          <>
            <p className="acct__muted">درخواست قبلی شما تأیید نشد — می‌توانید دوباره درخواست دهید.</p>
            <ApplyForm note={applyNote} setNote={setApplyNote} onApply={apply} />
          </>
        ) : (
          <>
            <p className="acct__muted">
              با دریافت کد ارجاع اختصاصی، کاربرانی که با لینک شما درخواست مشاوره ثبت کنند به حساب شما منسوب می‌شوند.
            </p>
            <ApplyForm note={applyNote} setNote={setApplyNote} onApply={apply} />
          </>
        )}
        {msg && <p className="acct__notice">{msg}</p>}
      </div>
    )
  }

  const link = `${window.location.origin}${home.ref_link ?? ''}`

  return (
    <div className="acct__marketing">
      <div className="acct__card">
        <h2>کد و لینک ارجاع شما</h2>
        <div className="acct__refbox">
          <code dir="ltr">{home.ref_code}</code>
          <button className="btn btn--ghost" onClick={() => copy(home.ref_code ?? '')}>
            <Copy size={14} /> کپی کد
          </button>
          <button className="btn btn--ghost" onClick={() => copy(link)}>
            <Copy size={14} /> کپی لینک
          </button>
        </div>
        {home.is_active === false && <p className="acct__err">کد شما توسط مدیریت غیرفعال شده است.</p>}
      </div>

      <div className="acct__grid acct__grid--stats">
        <div className="acct__card acct__stat"><p className="acct__stat-num">{(home.stats?.clicks ?? 0).toLocaleString('fa-IR')}</p><p className="acct__muted">کلیک</p></div>
        <div className="acct__card acct__stat"><p className="acct__stat-num">{(home.stats?.requests ?? 0).toLocaleString('fa-IR')}</p><p className="acct__muted">درخواست منسوب</p></div>
        <div className="acct__card acct__stat"><p className="acct__stat-num">{(home.stats?.accepted ?? 0).toLocaleString('fa-IR')}</p><p className="acct__muted">پذیرفته‌شده</p></div>
        <div className="acct__card acct__stat"><p className="acct__stat-num">{(home.stats?.conversion ?? 0).toLocaleString('fa-IR')}٪</p><p className="acct__muted">نرخ تبدیل</p></div>
      </div>

      <div className="acct__card">
        <h2>ارجاع‌های اخیر</h2>
        {refs.length === 0 ? <p className="acct__muted">هنوز ارجاعی ثبت نشده است.</p> : (
          <div className="acct__list">
            {refs.map((r, i) => (
              <div key={i} className="acct__row">
                <span className="acct__row-topic">{r.masked_name}</span>
                <span className="acct__badge">{r.status}</span>
                <span className="acct__muted">{faDate(r.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="acct__card">
        <h2><Wallet size={17} /> کیف پول</h2>
        {!home.commission_enabled ? (
          <p className="acct__muted">سیستم کمیسیون فعلاً غیرفعال است؛ آمار ارجاع همچنان ثبت می‌شود.</p>
        ) : wallet ? (
          <>
            <div className="acct__grid acct__grid--stats">
              <div className="acct__stat"><p className="acct__stat-num">{rial(wallet.balance)}</p><p className="acct__muted">قابل برداشت</p></div>
              <div className="acct__stat"><p className="acct__stat-num">{rial(wallet.pending_commissions)}</p><p className="acct__muted">کمیسیون در انتظار</p></div>
              <div className="acct__stat"><p className="acct__stat-num">{rial(wallet.pending_payouts)}</p><p className="acct__muted">برداشت در صف</p></div>
            </div>
            <div className="acct__payout">
              <input dir="ltr" inputMode="numeric" placeholder={`حداقل ${wallet.min_payout.toLocaleString('fa-IR')} ریال`} value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button className="btn btn--primary" disabled={!amount} onClick={requestPayout}>درخواست برداشت</button>
            </div>
            {!home.iban_masked && <p className="acct__err">قبل از برداشت، شماره شبا را ثبت کنید.</p>}
          </>
        ) : <p className="acct__muted">…</p>}
      </div>

      <div className="acct__card">
        <h2>اطلاعات بانکی</h2>
        <p className="acct__muted">شبا فعلی: <span dir="ltr">{home.iban_masked || 'ثبت نشده'}</span></p>
        <div className="acct__payout">
          <input dir="ltr" placeholder="IR06…" value={iban} onChange={(e) => setIban(e.target.value)} />
          <button className="btn btn--ghost" disabled={!iban} onClick={saveBank}>ذخیره شبا</button>
        </div>
        {payouts.length > 0 && (
          <div className="acct__list acct__payouts">
            {payouts.map((p) => (
              <div key={p.id} className="acct__row">
                <span>{rial(p.amount)}</span>
                <span className="acct__badge">{({ pending: 'در انتظار', paid: 'پرداخت‌شده', approved: 'تأییدشده', rejected: 'رد شده' } as Record<string, string>)[p.status] ?? p.status}</span>
                <span className="acct__muted" dir="ltr">{p.payment_ref || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {msg && <p className="acct__notice">{msg}</p>}
    </div>
  )
}

function ApplyForm({ note, setNote, onApply }: { note: string; setNote: (s: string) => void; onApply: () => void }) {
  return (
    <div className="acct__apply">
      <textarea rows={3} placeholder="چرا می‌خواهید بازاریاب شوید؟ (اختیاری)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn btn--primary" onClick={onApply}>ارسال درخواست</button>
    </div>
  )
}

/* ─── profile ───────────────────────────────────────────────── */

function Profile({ onChanged }: { onChanged: () => Promise<void> }) {
  const { me } = useAuth()
  const [name, setName] = useState(me?.full_name ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [msg, setMsg] = useState('')

  const saveProfile = async () => {
    try {
      await api.patch('/account/me', { full_name: name })
      await onChanged()
      setMsg('ذخیره شد.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }
  const savePw = async () => {
    try {
      await api.post('/account/password', { current: pw.current, new: pw.next })
      setPw({ current: '', next: '' })
      setMsg('رمز عبور تغییر کرد.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    }
  }

  return (
    <div className="acct__grid">
      <div className="acct__card">
        <h2>مشخصات</h2>
        <label className="acct__field">
          <span>نام و نام خانوادگی</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <p className="acct__muted">شماره موبایل: <span dir="ltr">{me?.phone}</span></p>
        <button className="btn btn--primary" onClick={saveProfile}>ذخیره</button>
      </div>
      <div className="acct__card">
        <h2>تغییر رمز عبور</h2>
        <label className="acct__field">
          <span>رمز فعلی</span>
          <input dir="ltr" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </label>
        <label className="acct__field">
          <span>رمز جدید (حداقل ۸ کاراکتر)</span>
          <input dir="ltr" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </label>
        <button className="btn btn--ghost" disabled={!pw.current || pw.next.length < 8} onClick={savePw}>تغییر رمز</button>
      </div>
      {msg && <p className="acct__notice">{msg}</p>}
    </div>
  )
}
