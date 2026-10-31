/** بازاریابی — نمای کلی · لینک‌ها و ابزارها · ارجاع‌های من · کمیسیون‌ها ·
 *  قوانین و راهنما (۵ تب داخلی، spec §4.6 — بدون کیف پول). */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BadgePercent, Clock3, Copy, Plus, QrCode, Send, Share2, Trash2, XCircle } from 'lucide-react'
import { api, apiAsset } from '../../services/api'
import { useAuth } from '../../services/auth'
import type { CommissionsView, MarketerHome, MarketerLink, PaymentsView, Referral } from './types'
import { COMMISSION_FA, faDate, faDateTime, toman } from './types'

const CHANNELS = ['اینستاگرام', 'تلگرام', 'واتس‌اپ', 'وب‌سایت / وبلاگ', 'معرفی حضوری', 'سایر']

/** کانال‌های whitelist لینک ارجاع — با بک‌اند هم‌خوان. */
const LINK_CHANNELS: [string, string][] = [
  ['instagram', 'اینستاگرام'],
  ['telegram', 'تلگرام'],
  ['whatsapp', 'واتس‌اپ'],
  ['website', 'وب‌سایت / وبلاگ'],
  ['email', 'ایمیل / خبرنامه'],
  ['other', 'سایر'],
]
const CHANNEL_FA = Object.fromEntries(LINK_CHANNELS)

const TABS = [
  { key: 'overview', label: 'نمای کلی' },
  { key: 'links', label: 'لینک‌ها و ابزارها' },
  { key: 'referrals', label: 'ارجاع‌های من' },
  { key: 'commissions', label: 'کمیسیون‌های من' },
  { key: 'bank', label: 'اطلاعات پرداخت' },
  { key: 'guide', label: 'قوانین و راهنما' },
]

const fa = (n: number) => n.toLocaleString('fa-IR')

export default function MarketingPage() {
  const { me, refresh } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'overview'
  const [home, setHome] = useState<MarketerHome | null>(null)
  const [msg, setMsg] = useState('')
  const isMarketer = me?.is_marketer ?? false

  const load = () => {
    api
      .get<MarketerHome>('/account/marketer')
      .then(setHome)
      .catch(() => setHome({ status: 'none', marketing_enabled: false }))
  }
  useEffect(load, [isMarketer]) // eslint-disable-line react-hooks/exhaustive-deps

  const copy = (text: string, what = 'کپی شد') => {
    void navigator.clipboard?.writeText(text).then(() => setMsg(what))
  }

  if (!home)
    return (
      <div className="acc__page">
        <p className="acc__muted">در حال بارگذاری…</p>
      </div>
    )

  if (home.marketing_enabled === false) {
    return (
      <div className="acc__page">
        <h1 className="acc__title">بازاریابی</h1>
        <div className="acc__card acc__empty">
          <p>سیستم بازاریابی و ارجاع فعلاً غیرفعال است.</p>
        </div>
      </div>
    )
  }

  if (home.status === 'suspended') {
    return (
      <div className="acc__page">
        <h1 className="acc__title">بازاریابی</h1>
        <div className="acc__card">
          <div className="acc__state acc__state--rejected">
            <XCircle size={20} aria-hidden="true" />
            <div>
              <p>همکاری بازاریابی شما توسط مدیریت تعلیق شده است.</p>
              <p className="acc__muted">
                کد و لینک ارجاع شما غیرفعال است؛ برای اطلاعات بیشتر با پشتیبانی در تماس باشید.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!isMarketer) {
    return (
      <ApplyGate
        home={home}
        onApplied={async () => {
          await refresh()
          load()
        }}
      />
    )
  }

  const base = window.location.origin
  const mainUrl = `${base}${home.ref_link ?? `/r/${home.ref_code}`}`

  return (
    <div className="acc__page">
      <h1 className="acc__title">بازاریابی</h1>
      {home.is_active === false && <p className="acc__err">کد ارجاع شما توسط مدیریت غیرفعال شده است.</p>}

      <p className="acc__muted acc__hint">
        هزینه‌ای از مراجعه‌کننده دریافت نمی‌شود و کمیسیون از محل حق‌الوکالهٔ دفتر است.
      </p>
      <div className="acc__chips" role="tablist" aria-label="بخش‌های بازاریابی">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`acc__chip${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {msg && <p className="acc__notice">{msg}</p>}

      {tab === 'overview' && <OverviewTab home={home} mainUrl={mainUrl} copy={copy} />}
      {tab === 'links' && <LinksTab home={home} base={base} copy={copy} reload={load} />}
      {tab === 'referrals' && <ReferralsTab />}
      {tab === 'commissions' && <CommissionsTab />}
      {tab === 'bank' && <BankTab />}
      {tab === 'guide' && <GuideTab home={home} />}
    </div>
  )
}

/* ── نمای کلی ─────────────────────────────────────────────── */

function OverviewTab({
  home,
  mainUrl,
  copy,
}: {
  home: MarketerHome
  mainUrl: string
  copy: (t: string, m?: string) => void
}) {
  const s = home.stats
  const funnel: [string, number][] = [
    ['کلیک', s?.clicks ?? 0],
    ['کلیک یکتا', s?.unique_clicks ?? 0],
    ['درخواست منسوب', s?.requests ?? 0],
    ['پذیرفته‌شده', s?.accepted ?? 0],
  ]
  const maxBar = funnel[0][1] || 1

  return (
    <>
      {/* کد + لینک اصلی + اشتراک */}
      <div className="acc__card">
        <h2>
          <Share2 size={16} /> کد و لینک ارجاع شما
        </h2>
        <div className="acc__copygrid">
          <div className="acc__copyrow">
            <code dir="ltr">{home.ref_code}</code>
            <button
              className="acc__copybtn"
              aria-label="کپی کد ارجاع"
              title="کپی کد"
              onClick={() => copy(home.ref_code ?? '', 'کد کپی شد')}
            >
              <Copy size={15} />
            </button>
          </div>
          <div className="acc__copyrow" dir="ltr">
            <code dir="ltr">{mainUrl}</code>
            <button
              className="acc__copybtn"
              aria-label="کپی لینک ارجاع"
              title="کپی لینک"
              onClick={() => copy(mainUrl, 'لینک کپی شد')}
            >
              <Copy size={15} />
            </button>
          </div>
        </div>
        <div className="acc__share">
          <a
            className="btn btn--ghost btn--sm"
            href={`https://t.me/share/url?url=${encodeURIComponent(mainUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Send size={13} /> تلگرام
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={`https://wa.me/?text=${encodeURIComponent(mainUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            واتس‌اپ
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={apiAsset('/api/v1/account/marketer/qr.png')}
            target="_blank"
            rel="noopener noreferrer"
            download={`qr-${home.ref_code}.png`}
          >
            <QrCode size={13} /> QR
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={apiAsset('/api/v1/account/marketer/card.png')}
            download={`card-${home.ref_code}.png`}
          >
            کارت معرفی (PNG)
          </a>
          <a
            className="btn btn--ghost btn--sm"
            href={apiAsset('/api/v1/account/marketer/card.pdf')}
            download={`card-${home.ref_code}.pdf`}
          >
            کارت چاپی (PDF)
          </a>
        </div>
        <p className="acc__muted acc__hint">
          اعتبار کوکی ارجاع {fa(home.cookie_days ?? 30)} روز است — هر بازدیدکننده‌ای که در این بازه ثبت
          درخواست کند به شما منسوب می‌شود.
        </p>
      </div>

      {/* آمار به تفکیک کانال */}
      {home.stats?.channels && (
        <div className="acc__card">
          <h2>آمار به تفکیک کانال</h2>
          <div className="acc__list">
            {home.stats.channels.map((c) => (
              <div key={c.channel} className="acc__row">
                <span className="acc__row-topic">{CHANNEL_FA[c.channel] ?? c.channel}</span>
                <span className="acc__muted">
                  {fa(c.clicks)} کلیک · {fa(c.unique_clicks)} یکتا · {fa(c.requests)} درخواست
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPIها */}
      <div className="acc__stats">
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{fa(s?.unique_clicks ?? 0)}</p>
          <p className="acc__muted">کلیک یکتا</p>
        </div>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{fa(s?.requests ?? 0)}</p>
          <p className="acc__muted">درخواست منسوب</p>
        </div>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{fa(s?.accepted ?? 0)}</p>
          <p className="acc__muted">پذیرفته‌شده</p>
        </div>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{fa(s?.conversion ?? 0)}٪</p>
          <p className="acc__muted">نرخ تبدیل</p>
        </div>
      </div>

      {/* قیف */}
      <div className="acc__card">
        <h2>قیف ارجاع</h2>
        <div className="acc__funnel">
          {funnel.map(([label, n]) => (
            <div key={label} className="acc__funnel-row">
              <span className="acc__funnel-label">{label}</span>
              <div className="acc__funnel-track">
                <div
                  className="acc__funnel-bar"
                  style={{ width: `${Math.max(n ? 4 : 0, (n / maxBar) * 100)}%` }}
                />
              </div>
              <span className="acc__funnel-num" dir="ltr">
                {fa(n)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

/* ── لینک‌ها و ابزارها ─────────────────────────────────────── */

function LinksTab({
  home,
  base,
  copy,
  reload,
}: {
  home: MarketerHome
  base: string
  copy: (t: string, m?: string) => void
  reload: () => void
}) {
  const [channel, setChannel] = useState(LINK_CHANNELS[0][0])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const links = home.links ?? []

  const share = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ url })
      } catch {
        /* dismissed */
      }
    } else {
      copy(url, 'لینک کپی شد')
    }
  }
  const create = async () => {
    setErr('')
    setBusy(true)
    try {
      await api.post('/account/marketer/links', { channel })
      reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }
  const remove = async (ch: string) => {
    try {
      await api.del(`/account/marketer/links/${ch}`)
      reload()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    }
  }

  return (
    <>
      <div className="acc__card">
        <h2>
          <Plus size={16} /> ساخت لینک کانالی
        </h2>
        <p className="acc__muted">
          برای هر کانال یک لینک مخصوص بسازید تا کلیک و درخواست هر منبع جدا دیده شود (مثلاً{' '}
          <code dir="ltr">/r/کد?s=instagram</code>).
        </p>
        <div className="acc__inline">
          <select value={channel} onChange={(e) => setChannel(e.target.value)}>
            {LINK_CHANNELS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn btn--primary" disabled={busy} onClick={create}>
            ساخت لینک
          </button>
        </div>
        {err && <p className="acc__err">{err}</p>}
      </div>

      <div className="acc__card">
        <h2>لینک‌های شما</h2>
        {links.length === 0 ? (
          <p className="acc__muted">هنوز لینک کانالی نساخته‌اید — لینک اصلی همیشه فعال است.</p>
        ) : (
          <div className="acc__list">
            {links.map((l: MarketerLink) => {
              const url = `${base}${l.url}`
              return (
                <div key={l.id} className="acc__row acc__row--link">
                  <span className="acc__row-topic">{CHANNEL_FA[l.channel] ?? l.channel}</span>
                  <span className="acc__muted">
                    {fa(l.clicks)} کلیک · {fa(l.unique_clicks)} یکتا · {fa(l.requests)} درخواست
                  </span>
                  <span className="acc__row-actions">
                    <button className="acc__iconbtn" title="اشتراک‌گذاری" onClick={() => void share(url)}>
                      <Share2 size={15} />
                    </button>
                    <button
                      className="acc__iconbtn"
                      title="کپی لینک"
                      onClick={() => copy(url, 'لینک کپی شد')}
                    >
                      <Copy size={15} />
                    </button>
                    <a
                      className="acc__iconbtn"
                      title="دانلود QR"
                      href={apiAsset(`/api/v1/account/marketer/qr.png?s=${encodeURIComponent(l.channel)}`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`qr-${l.channel}.png`}
                    >
                      <QrCode size={15} />
                    </a>
                    <button
                      className="acc__iconbtn acc__iconbtn--danger"
                      title="حذف لینک"
                      onClick={() => remove(l.channel)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

/* ── ارجاع‌های من (محرمانگی: نام ماسک‌شده، بدون جزئیات پرونده) ── */

function ReferralsTab() {
  const [refs, setRefs] = useState<Referral[] | null>(null)
  useEffect(() => {
    api
      .get<Referral[]>('/account/marketer/referrals')
      .then(setRefs)
      .catch(() => setRefs([]))
  }, [])
  return (
    <div className="acc__card">
      <h2>ارجاع‌های من</h2>
      <p className="acc__muted acc__hint">
        نام کامل معرفی‌شده فقط با رضایت خودش نمایش داده می‌شود؛ جزئیات پرونده هرگز به شما نشان داده نمی‌شود.
      </p>
      {!refs ? (
        <p className="acc__muted">در حال بارگذاری…</p>
      ) : refs.length === 0 ? (
        <p className="acc__muted">هنوز ارجاعی ثبت نشده است — لینک‌تان را منتشر کنید.</p>
      ) : (
        <div className="acc__list">
          <div className="acc__row acc__row--head">
            <span>معرفی‌شده</span>
            <span>وضعیت قرارداد</span>
            <span>حق‌الوکالهٔ مرتبط</span>
            <span>کمیسیون من</span>
            <span>تاریخ</span>
          </div>
          {refs.map((r) => (
            <div key={r.id} className="acc__row">
              <span className="acc__row-topic">{r.name}</span>
              <span className="acc__badge">{r.contract_status}</span>
              <span>{r.fee_amount ? toman(r.fee_amount) : '—'}</span>
              <span className="acc__amt" dir="ltr">
                {r.commission_amount != null ? toman(r.commission_amount) : '—'}
                {r.commission_status && (
                  <span className="acc__muted">
                    {' '}
                    · {COMMISSION_FA[r.commission_status] ?? r.commission_status}
                  </span>
                )}
              </span>
              <span className="acc__muted">{faDate(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── کمیسیون‌های من — جدول وضعیت‌دار + جمع به تفکیک وضعیت ── */

function CommissionsTab() {
  const [view, setView] = useState<CommissionsView | null>(null)
  const [pays, setPays] = useState<PaymentsView | null>(null)
  const [err, setErr] = useState('')

  const load = () => {
    api
      .get<CommissionsView>('/account/commissions')
      .then(setView)
      .catch((e) => setErr(e instanceof Error ? e.message : 'خطا'))
    api
      .get<PaymentsView>('/account/payments')
      .then(setPays)
      .catch(() => {})
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !view) return <p className="acc__err">{err}</p>
  if (!view) return <p className="acc__muted">در حال بارگذاری…</p>
  if (!view.marketing_enabled) {
    return (
      <div className="acc__card acc__empty">
        <p>سیستم بازاریابی فعلاً غیرفعال است.</p>
      </div>
    )
  }
  const t = view.totals

  return (
    <>
      <div className="acc__stats">
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{toman(t.pending)}</p>
          <p className="acc__muted">در انتظار</p>
        </div>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{toman(t.approved)}</p>
          <p className="acc__muted">تأییدشده (قابل پرداخت)</p>
        </div>
        <div className="acc__card acc__stat">
          <p className="acc__stat-num">{toman(t.paid)}</p>
          <p className="acc__muted">پرداخت‌شده</p>
        </div>
      </div>

      <div className="acc__card">
        <h2>
          <BadgePercent size={16} /> کمیسیون‌های من
        </h2>
        <p className="acc__muted acc__hint">
          کمیسیون به‌ازای هر واریزی حق‌الوکالهٔ دفتر در پروندهٔ معرفی‌شده محاسبه می‌شود؛ تسویه توسط مدیریت
          انجام می‌شود و فیش آن همین‌جا قابل مشاهده است.
        </p>
        {view.items.length === 0 ? (
          <p className="acc__muted">
            هنوز کمیسیونی ثبت نشده است — با دریافت حق‌الوکاله در پروندهٔ معرفی‌شده، ردیف کمیسیون این‌جا
            می‌آید.
          </p>
        ) : (
          <div className="acc__list">
            <div className="acc__row acc__row--head">
              <span>معرفی‌شده</span>
              <span>وضعیت قرارداد</span>
              <span>حق‌الوکالهٔ دفتر</span>
              <span>نرخ من</span>
              <span>کمیسیون من</span>
              <span>وضعیت</span>
              <span>تاریخ</span>
            </div>
            {view.items.map((c) => (
              <div key={c.id} className="acc__row acc__row--comm">
                <span className="acc__row-topic">{c.name}</span>
                <span className="acc__muted">{c.contract_status}</span>
                <span>{c.fee_amount ? toman(c.fee_amount) : '—'}</span>
                <span>٪{fa(c.rate)}</span>
                <span className={`acc__amt ${c.amount < 0 ? 'is-neg' : 'is-pos'}`} dir="ltr">
                  {c.entry_type === 'reversal' ? 'برگشت: ' : ''}
                  {toman(c.amount)}
                </span>
                <span className={`acc__badge${c.status === 'paid' ? ' acc__badge--gold' : ''}`}>
                  {COMMISSION_FA[c.status] ?? c.status}
                </span>
                <span className="acc__muted">{faDate(c.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="acc__card">
        <h2>پرداخت‌ها و فیش‌ها</h2>
        {!pays || pays.items.length === 0 ? (
          <p className="acc__muted">هنوز پرداختی ثبت نشده است.</p>
        ) : (
          <div className="acc__list">
            {pays.items.map((p) => (
              <div key={p.id} className="acc__row">
                <span className="acc__row-topic acc__amt is-pos" dir="ltr">
                  {toman(p.amount)}
                </span>
                <span className="acc__muted">
                  {faDateTime(p.paid_at)}
                  {p.tracking_ref ? ` · پیگیری ${p.tracking_ref}` : ''}
                  {p.note ? ` — ${p.note}` : ''}
                </span>
                {p.receipt_url && (
                  <a
                    className="btn btn--ghost btn--sm"
                    href={apiAsset(p.receipt_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    مشاهده فیش
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/* ── اطلاعات پرداخت (کارت/شبا — رمزنگاری‌شده) ───────────────── */

function BankTab() {
  const [form, setForm] = useState({ account_name: '', card_number: '', iban: '' })
  const [bank, setBank] = useState<MarketerHome['bank'] | null>(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    api
      .get<MarketerHome['bank']>('/account/marketer/bank')
      .then(setBank)
      .catch(() => {})
  }
  useEffect(load, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setErr('')
    setMsg('')
    setBusy(true)
    try {
      await api.put('/account/marketer/bank', form)
      setMsg('اطلاعات پرداخت ذخیره شد — برای امنیت، اولین پرداخت به حساب جدید تا ۲۴ ساعت ممکن نیست.')
      setForm({ account_name: '', card_number: '', iban: '' })
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc__card">
      <h2>اطلاعات پرداخت</h2>
      <p className="acc__muted acc__hint">
        تسویهٔ کمیسیون به این حساب انجام می‌شود. اطلاعات به‌صورت رمزنگاری‌شده نگهداری می‌شود و فقط به‌صورت
        پوشیده نمایش داده می‌شود.
      </p>
      {bank?.has_bank && (
        <div className="acc__list" style={{ marginBottom: '1rem' }}>
          <div className="acc__row">
            <span className="acc__muted">صاحب حساب</span>
            <span>{bank.account_name}</span>
          </div>
          {bank.iban_masked && (
            <div className="acc__row">
              <span className="acc__muted">شبا</span>
              <span dir="ltr">{bank.iban_masked}</span>
            </div>
          )}
          {bank.card_masked && (
            <div className="acc__row">
              <span className="acc__muted">کارت</span>
              <span dir="ltr">{bank.card_masked}</span>
            </div>
          )}
        </div>
      )}
      {bank?.payout_hold_until && new Date(bank.payout_hold_until) > new Date() && (
        <p className="acc__notice">
          اطلاعات پرداخت به‌تازگی تغییر کرده است؛ پرداخت بعدی تا {faDateTime(bank.payout_hold_until)} ممکن
          نیست.
        </p>
      )}
      <div className="acc__apply">
        <label className="acc__field">
          <span>نام صاحب حساب</span>
          <input
            value={form.account_name}
            onChange={(e) => setForm({ ...form, account_name: e.target.value })}
          />
        </label>
        <label className="acc__field">
          <span>شماره کارت (۱۶ رقم)</span>
          <input
            dir="ltr"
            inputMode="numeric"
            maxLength={16}
            placeholder="6037…"
            value={form.card_number}
            onChange={(e) => setForm({ ...form, card_number: e.target.value })}
          />
        </label>
        <label className="acc__field">
          <span>شماره شبا (IR + ۲۴ رقم)</span>
          <input
            dir="ltr"
            inputMode="numeric"
            maxLength={26}
            placeholder="IR06…"
            value={form.iban}
            onChange={(e) => setForm({ ...form, iban: e.target.value })}
          />
        </label>
      </div>
      {msg && <p className="acc__notice">{msg}</p>}
      {err && <p className="acc__err">{err}</p>}
      <button
        className="btn btn--primary"
        disabled={busy || (!form.card_number.trim() && !form.iban.trim())}
        onClick={save}
      >
        ذخیره اطلاعات پرداخت
      </button>
    </div>
  )
}

/* ── قوانین و راهنما ───────────────────────────────────────── */

function GuideTab({ home }: { home: MarketerHome }) {
  return (
    <>
      <div className="acc__card">
        <h2>نرخ کمیسیون شما</h2>
        {home.my_rate != null && (
          <p className="acc__muted">
            نرخ فعلی شما: <strong>٪{fa(home.my_rate)}</strong> از حق‌الوکالهٔ دریافتی دفتر
            {home.rate_source === 'custom' && ' (نرخ اختصاصی شما)'}
          </p>
        )}
        <p className="acc__muted acc__hint">
          نرخ در لحظهٔ ثبت هر کمیسیون ذخیره (snapshot) می‌شود؛ تغییرات بعدی درصد روی ردیف‌های قبلی اثری ندارد.
        </p>
      </div>

      {home.terms?.body && (
        <div className="acc__card">
          <h2>قوانین و شرایط همکاری{home.terms.version ? ` — نسخهٔ ${fa(home.terms.version)}` : ''}</h2>
          <p className="acc__terms-body">{home.terms.body}</p>
        </div>
      )}

      <div className="acc__card">
        <h2>قواعد رفتار حرفه‌ای</h2>
        <ul className="acc__guidelist">
          <li>
            هیچ‌گاه وعدهٔ نتیجهٔ پرونده یا خروجی قطعی دعوا ندهید — معرفی شما صرفاً برای دریافت مشاوره است.
          </li>
          <li>اطلاعات افرادی که با لینک شما می‌آیند محرمانه است؛ فقط وضعیت کلی به شما نمایش داده می‌شود.</li>
          <li>ثبت درخواست‌های صوری یا ارجاع خود به عنوان مشتری، کمیسیون نمی‌سازد و موجب تعلیم کد می‌شود.</li>
          <li>هر شمارهٔ موبایل فقط یک‌بار «مشتری جدید» محسوب می‌شود.</li>
          <li>کلیک‌های غیرعادی و تکراری به‌طور خودکار شناسایی و برای بررسی مدیریت پرچم می‌خورند.</li>
        </ul>
      </div>

      <div className="acc__card">
        <h2>چطور کار می‌کند؟</h2>
        <ol className="acc__guidelist">
          <li>لینک اختصاصی خود را در شبکه‌های اجتماعی منتشر کنید.</li>
          <li>
            بازدیدکننده با لینک شما وارد سایت می‌شود و کوکی ارجاع {fa(home.cookie_days ?? 30)} روزه ثبت
            می‌گردد.
          </li>
          <li>اگر در این بازه درخواست مشاوره ثبت کند، ارجاع به شما منسوب و قفل می‌شود.</li>
          <li>
            پس از پذیرش پرونده توسط مدیریت، کمیسیون طبق قواعد ثبت می‌شود؛ تسویه توسط مدیریت انجام و در همین
            پنل «پرداخت‌شده» علامت می‌خورد.
          </li>
        </ol>
      </div>
    </>
  )
}

/* ── درخواست بازاریاب شدن (حالت غیربازاریاب) ───────────────── */

function ApplyGate({ home, onApplied }: { home: MarketerHome; onApplied: () => Promise<void> }) {
  const [note, setNote] = useState('')
  const [channel, setChannel] = useState(CHANNELS[0])
  const [terms, setTerms] = useState(false)
  const [termsErr, setTermsErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const reapplyDate = home.reapply_at ? new Date(home.reapply_at) : null
  const mustWait = reapplyDate !== null && reapplyDate > new Date()

  const apply = async () => {
    if (!terms) {
      setTermsErr(true)
      return
    }
    setBusy(true)
    try {
      await api.post('/account/marketer/apply', { note, channel, terms })
      setMsg('درخواست شما ثبت شد؛ پس از تأیید مدیریت فعال می‌شود.')
      await onApplied()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'خطا')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc__page">
      <h1 className="acc__title">بازاریابی</h1>
      <div className="acc__card">
        <h2>
          <Share2 size={17} /> درخواست بازاریاب شدن
        </h2>

        {home.status === 'pending' ? (
          <div className="acc__state acc__state--pending">
            <Clock3 size={20} aria-hidden="true" />
            <div>
              <p>درخواست شما در حال بررسی است.</p>
              {home.applied_at && (
                <p className="acc__muted">
                  ثبت‌شده در {faDate(home.applied_at)} — نتیجه از طریق اعلان اطلاع‌رسانی می‌شود.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {home.status === 'rejected' && (
              <div className="acc__state acc__state--rejected">
                <XCircle size={20} aria-hidden="true" />
                <div>
                  <p>درخواست قبلی شما تأیید نشد.</p>
                  {home.reject_reason && <p className="acc__muted">دلیل: {home.reject_reason}</p>}
                  {mustWait && reapplyDate && (
                    <p className="acc__muted">امکان ثبت مجدد از {faDate(reapplyDate.toISOString())}</p>
                  )}
                </div>
              </div>
            )}
            {mustWait ? null : (
              <>
                <p className="acc__muted">
                  با دریافت کد ارجاع اختصاصی، کاربرانی که با لینک شما درخواست مشاوره ثبت کنند به حساب شما
                  منسوب می‌شوند.
                  {home.default_rate != null && home.default_rate > 0 && (
                    <>
                      {' '}
                      کمیسیون فعلی: <strong>٪{fa(home.default_rate)}</strong> از حق‌الوکالهٔ دریافتی دفتر.
                    </>
                  )}
                </p>
                {home.terms?.body && (
                  <details className="acc__terms">
                    <summary>
                      قوانین و شرایط همکاری{home.terms.version ? ` — نسخهٔ ${fa(home.terms.version)}` : ''}
                    </summary>
                    <p className="acc__terms-body">{home.terms.body}</p>
                  </details>
                )}
                <div className="acc__apply">
                  <label className="acc__field">
                    <span>کانال اصلی معرفی</span>
                    <select value={channel} onChange={(e) => setChannel(e.target.value)}>
                      {CHANNELS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="acc__field">
                    <span>
                      توضیح کوتاه <em>(اختیاری)</em>
                    </span>
                    <textarea
                      rows={3}
                      placeholder="چطور می‌خواهید دادنوین را معرفی کنید؟"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <label className="authp__check">
                    <input
                      type="checkbox"
                      checked={terms}
                      onChange={(e) => {
                        setTerms(e.target.checked)
                        setTermsErr(false)
                      }}
                    />
                    <span>
                      قوانین بازاریابی و حفظ محرمانگی موکل را می‌پذیرم
                      {home.terms?.version ? ` (نسخهٔ ${fa(home.terms.version)})` : ''}
                    </span>
                  </label>
                  {termsErr && <em className="acc__hint authp__hint--err">پذیرش قوانین الزامی است.</em>}
                  <button className="btn btn--primary" disabled={busy} onClick={apply}>
                    {busy ? 'در حال ارسال…' : 'ارسال درخواست'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
        {msg && <p className="acc__notice">{msg}</p>}
      </div>
    </div>
  )
}
