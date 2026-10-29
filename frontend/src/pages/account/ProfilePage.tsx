import { useState } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../services/auth'

export default function ProfilePage() {
  const { me, refresh } = useAuth()
  const [name, setName] = useState(me?.full_name ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const saveProfile = async () => {
    try {
      await api.patch('/account/me', { full_name: name })
      await refresh()
      setMsg('ذخیره شد.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    }
  }
  const savePw = async () => {
    try {
      await api.post('/account/password', { current: pw.current, new: pw.next })
      setPw({ current: '', next: '' })
      setMsg('رمز عبور تغییر کرد.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'خطا')
    }
  }

  return (
    <div className="acc__page">
      <h1 className="acc__title">پروفایل</h1>
      {err && <p className="acc__err">{err}</p>}
      {msg && <p className="acc__notice">{msg}</p>}
      <div className="acc__grid">
        <div className="acc__card">
          <h2>مشخصات</h2>
          <label className="acc__field">
            <span>نام و نام خانوادگی</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <p className="acc__muted">شماره موبایل: <span dir="ltr">{me?.phone}</span></p>
          <button className="btn btn--primary" onClick={saveProfile}>ذخیره</button>
        </div>
        <div className="acc__card">
          <h2>تغییر رمز عبور</h2>
          <label className="acc__field">
            <span>رمز فعلی</span>
            <input dir="ltr" type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
          </label>
          <label className="acc__field">
            <span>رمز جدید (حداقل ۸ کاراکتر)</span>
            <input dir="ltr" type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </label>
          <button className="btn btn--ghost" disabled={!pw.current || pw.next.length < 8} onClick={savePw}>تغییر رمز</button>
        </div>
      </div>
    </div>
  )
}
