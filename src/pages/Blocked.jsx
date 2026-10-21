import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// 引退した部員、招待から登録していない人に出す画面
export function Retired() {
  return (
    <Screen title="引退済みです"
      body="このアカウントは引退扱いになっているため、アプリは使えません。間違いの場合は管理者に連絡してください。" />
  )
}

// ログインはできたが、まだ部員として登録していない人。招待リンクを貼れば、そのまま登録に進める
export function NoInvite() {
  const navigate = useNavigate()
  const [link, setLink] = useState('')
  const [error, setError] = useState('')

  function go(e) {
    e.preventDefault()
    const m = link.trim().match(/join\/([A-Za-z0-9_-]+)/) ?? link.trim().match(/^([A-Za-z0-9_-]{8,})$/)
    if (!m) { setError('招待リンクの形が正しくありません。届いたリンクをそのまま貼ってください。'); return }
    navigate(`/join/${m[1]}`)
  }

  return (
    <Screen title="招待リンクから登録してください"
      body="舞研アプリは部員専用です。幹部から届いた招待リンクを、下に貼り付けてください。">
      <form className="stack" onSubmit={go}>
        <label className="field"><span>招待リンク</span>
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/join/…" />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary" disabled={!link.trim()}>登録に進む</button>
      </form>
    </Screen>
  )
}

function Screen({ title, body, children }) {
  return (
    <div className="center-screen">
      <div className="logo" aria-hidden="true"><span>舞</span></div>
      <h1 className="page-title">{title}</h1>
      <p style={{ lineHeight: 1.7, margin: 0 }}>{body}</p>
      {children}
      <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}>ログアウト</button>
    </div>
  )
}
