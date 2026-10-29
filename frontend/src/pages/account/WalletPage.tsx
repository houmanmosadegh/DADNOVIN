import { useEffect, useState } from 'react'
import { Wallet } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'
import type { MarketerHome, Payout, WalletView } from './types'
import { LEDGER_FA, PAYOUT_FA, faDate, rial } from './types'

export default function WalletPage() {
  const { me } = useAuth()
  const [wallet, setWallet] = useState<WalletView | null>(null)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [home, setHome] = useState<MarketerHome | null>(null)
  const [amount, setAmount] = useState('')
  const [iban, setIban] = useState('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const isMarketer = me?.is_marketer ?? false

  const load = () => {
    if (!isMarketer) return
    api.get<WalletView>('/account/wallet').then(setWallet).catch(() => setErr('خطا در بارگذاری'))
    api.get<Payout[]>('/account/payouts').then(setPayouts).catch(() => {})
    api.get<MarketerHome>('/account/marketer').then(setHome).catch(() => {})
  }
  useEffect(load, [isMarketer]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveBank = async () => {
    try {
      await api.post('/account/marketer/bank', { iban, card: '' })
      setMsg('شماره شبا ذخیره شد.')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    }
  }
  const requestPayout = async () => {
    try {
      await api.post('/account/payouts', { amount: parseInt(amount.replace(/[,،]/g, ''), 10) })
      setMsg('درخواست برداشت ثبت شد.')
      setAmount('')
      load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    }
  }

  if (!isMarketer) {
    return (
      <div className="acc__page">
        <h1 className="acc__title">کیف پول</h1>
        <div className="acc__card acc__empty"><p>این بخش برای حساب‌های بازاریاب فعال است.</p></div>
      </div>
    )
  }

  return (
    <div className="acc__page">
      <h1 className="acc__title">کیف پول</h1>
      {err && <p className="acc__err">{err}</p>}
      {msg && <p className="acc__notice">{msg}</p>}

      {!wallet ? (
        <p className="acc__muted">در حال بارگذاری…</p>
      ) : !wallet.commission_enabled ? (
        <div className="acc__card acc__empty"><p>سیستم کمیسیون فعلاً غیرفعال است.</p></div>
      ) : (
        <>
          <div className="acc__stats">
            <div className="acc__card acc__stat"><p className="acc__stat-num">{rial(wallet.balance)}</p><p className="acc__muted">قابل برداشت</p></div>
            <div className="acc__card acc__stat"><p className="acc__stat-num">{rial(wallet.pending_commissions)}</p><p className="acc__muted">کمیسیون در انتظار</p></div>
            <div className="acc__card acc__stat"><p className="acc__stat-num">{rial(wallet.pending_payouts)}</p><p className="acc__muted">برداشت در صف</p></div>
          </div>

          <div className="acc__card">
            <h2><Wallet size={17} /> درخواست برداشت</h2>
            <div className="acc__payout">
              <input
                dir="ltr" inputMode="numeric"
                placeholder={`حداقل ${wallet.min_payout.toLocaleString('fa-IR')} ریال`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button className="btn btn--primary" disabled={!amount} onClick={requestPayout}>درخواست برداشت</button>
            </div>
            {!home?.iban_masked && <p className="acc__err">قبل از برداشت، شماره شبا را ثبت کنید.</p>}
          </div>

          <div className="acc__card">
            <h2>اطلاعات بانکی</h2>
            <p className="acc__muted">شبا فعلی: <span dir="ltr">{home?.iban_masked || 'ثبت نشده'}</span></p>
            <div className="acc__payout">
              <input dir="ltr" placeholder="IR06…" value={iban} onChange={(e) => setIban(e.target.value)} />
              <button className="btn btn--ghost" disabled={!iban} onClick={saveBank}>ذخیره شبا</button>
            </div>
            {payouts.length > 0 && (
              <div className="acc__list">
                <h3 className="acc__h3">تاریخچهٔ برداشت</h3>
                {payouts.map((p) => (
                  <div key={p.id} className="acc__row">
                    <span>{rial(p.amount)}</span>
                    <span className="acc__badge">{PAYOUT_FA[p.status] ?? p.status}</span>
                    <span className="acc__muted" dir="ltr">{p.payment_ref || '—'}</span>
                    <span className="acc__muted">{faDate(p.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="acc__card">
            <h2>تراکنش‌ها</h2>
            {wallet.entries.length === 0 ? <p className="acc__muted">تراکنشی نیست.</p> : (
              <div className="acc__list">
                {wallet.entries.map((e) => (
                  <div key={e.id} className="acc__row">
                    <span className={`acc__amt ${e.amount >= 0 ? 'is-pos' : 'is-neg'}`} dir="ltr">
                      {e.amount >= 0 ? '+' : '−'}{rial(Math.abs(e.amount))}
                    </span>
                    <span className="acc__row-topic">{LEDGER_FA[e.kind] ?? e.kind}{e.memo ? ` — ${e.memo}` : ''}</span>
                    <span className="acc__muted">{faDate(e.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
