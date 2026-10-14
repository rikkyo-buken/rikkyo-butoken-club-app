import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { MAJOR_LABELS, POSITION_LABELS, currentFiscalYear } from '../lib/constants'
import Login from './Login'

const TOKEN_KEY = 'butoken.inviteToken'

export function getStoredInvite() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
function storeInvite(token) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* 保存できなくても続行 */ }
}
export function clearInvite() {
  try { localStorage.removeItem(TOKEN_KEY) } catch { /* noop */ }
}

// 招待リンク（/join/xxxx）を開いたときの画面
export default function Join() {
  const { token } = useParams()
  const { session, member } = useSession()

  useEffect(() => {
    if (token) storeInvite(token)
  }, [token])

  if (!session) {
    return <Login redirectPath={`/join/${token}`} message="舞研アプリに招待されています。まずメールアドレスでログインしてください。" />
  }
  if (member) {
    clearInvite()
    return <Navigate to="/" replace />
  }
  return <ProfileForm token={token} />
}

// 初回のプロフィール入力。送信すると部員として登録される
export function ProfileForm({ token }) {
  const { reload } = useSession()
  const fy = currentFiscalYear()
  const [form, setForm] = useState({ full_name: '', nickname: '', join_year: fy, major: '', position: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.rpc('register_member', {
      p_token: token,
      p_full_name: form.full_name.trim(),
      p_nickname: form.nickname.trim(),
      p_join_year: Number(form.join_year),
      p_major: form.major,
      p_position: form.position
    })
    setBusy(false)
    if (error) {
      setError(error.message || '登録できませんでした')
      return
    }
    clearInvite()
    await reload()
  }

  const years = Array.from({ length: 6 }, (_, i) => fy - i)

  return (
    <div className="app no-tabbar">
      <form className="page" onSubmit={submit}>
        <div className="stack">
          <h1 className="page-title">プロフィールを登録</h1>
          <p className="sub">部員リストに表示されます。あとから変更できます。</p>
        </div>

        <label className="field">
          <span>氏名</span>
          <input className="input" required maxLength={50} autoComplete="name"
            value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="立教 太郎" />
        </label>
        <label className="field">
          <span>ニックネーム</span>
          <input className="input" required maxLength={30}
            value={form.nickname} onChange={(e) => set('nickname', e.target.value)} placeholder="たろう" />
        </label>
        <label className="field">
          <span>入部した年度</span>
          <select className="select" value={form.join_year} onChange={(e) => set('join_year', e.target.value)}>
            {years.map((y, i) => (
              <option key={y} value={y}>{y}年度（今 {Math.min(i + 1, 4)}年）</option>
            ))}
          </select>
        </label>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <span>専攻</span>
          <div className="choice-row">
            {Object.entries(MAJOR_LABELS).map(([k, label]) => (
              <button type="button" key={k} className="choice" aria-pressed={form.major === k} onClick={() => set('major', k)}>{label}</button>
            ))}
          </div>
        </fieldset>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <span>リーダー / パートナー</span>
          <div className="choice-row">
            {Object.entries(POSITION_LABELS).map(([k, label]) => (
              <button type="button" key={k} className="choice" aria-pressed={form.position === k} onClick={() => set('position', k)}>{label}</button>
            ))}
          </div>
        </fieldset>

        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !form.major || !form.position}>
          {busy ? '登録中…' : '登録する'}
        </button>
      </form>
    </div>
  )
}
