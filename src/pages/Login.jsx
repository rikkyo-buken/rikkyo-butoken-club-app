import { useState } from 'react'
import { supabase } from '../lib/supabase'

// エラーを日本語にする。分からないものは原文も出して、原因を調べられるようにする
function explain(error) {
  const raw = `${error.message || ''}`
  if (error.status === 429 || /rate limit/i.test(raw)) {
    return '短時間に送りすぎました。しばらく待ってからもう一度送ってください。'
  }
  if (/not authorized/i.test(raw)) {
    return 'このアドレスにはまだメールを送れません（メール送信の設定が未完了です）。管理者に連絡してください。\n詳細: ' + raw
  }
  if (/invalid login credentials/i.test(raw)) {
    return 'メールアドレスかパスワードが違います。'
  }
  return 'うまくいきませんでした。\n詳細: ' + raw
}

// メールでログインする。届いたメールの「リンク」を押すか、「コード」を入力する。
// iPhoneのホーム画面アプリでは、リンクを押すとSafariが開いてしまうため、コード入力を使う。
// 「テスト用：パスワード」は、Supabaseの管理画面で作ったテスト用アカウント専用。
export default function Login({ message, redirectPath = '/' }) {
  const [mode, setMode] = useState('email') // email | password
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendMail(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + redirectPath }
    })
    setBusy(false)
    if (error) { setError(explain(error)); return }
    setSent(true)
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('コードが違うか、期限が切れています。もう一度メールを送ってください。')
  }

  async function passwordLogin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) setError(explain(error))
  }

  return (
    <div className="center-screen">
      <div className="logo" aria-hidden="true"><span>舞</span></div>
      <div className="stack">
        <h1 className="page-title">舞研アプリにログイン</h1>
        {message && <div className="notice info">{message}</div>}
      </div>

      {mode === 'password' ? (
        <form className="stack" onSubmit={passwordLogin}>
          <div className="notice info">テスト用のログインです。管理者が用意したアカウントでのみ使えます。</div>
          <label className="field">
            <span>メールアドレス</span>
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>パスワード</span>
            <input className="input" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '確認中…' : 'ログインする'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => { setMode('email'); setError('') }}>メールでのログインに戻る</button>
        </form>
      ) : !sent ? (
        <form className="stack" onSubmit={sendMail}>
          <label className="field">
            <span>メールアドレス</span>
            <input className="input" type="email" required autoComplete="email" inputMode="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || !email}>
            {busy ? '送信中…' : 'ログイン用のメールを送る'}
          </button>
          <p className="sub">パスワードは不要です。届いたメールからログインします。</p>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <div className="notice ok">
            {email} にメールを送りました。メール内のリンクを押すか、書かれているコードを下に入力してください。
          </div>
          <label className="field">
            <span>メールに書かれたコード</span>
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6,8}" maxLength={8} required value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn btn-primary btn-block" disabled={busy || code.length < 6}>
            {busy ? '確認中…' : 'ログインする'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setSent(false); setCode('') }}>
            メールアドレスを入れ直す
          </button>
        </form>
      )}
      {error && <div className="notice error" role="alert" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{error}</div>}
      {mode === 'email' && !sent && (
        <button type="button" className="btn btn-ghost btn-small" style={{ alignSelf: 'center' }}
          onClick={() => { setMode('password'); setError('') }}>テスト用：パスワードでログイン</button>
      )}
    </div>
  )
}
