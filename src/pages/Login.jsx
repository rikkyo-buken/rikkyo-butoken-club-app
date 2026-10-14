import { useState } from 'react'
import { supabase } from '../lib/supabase'

// メールでログインする。届いたメールの「リンク」を押すか、「コード」を入力する。
// iPhoneのホーム画面アプリでは、リンクを押すとSafariが開いてしまうため、コード入力を使う。
export default function Login({ message, redirectPath = '/' }) {
  const [email, setEmail] = useState('')
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
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin + redirectPath
      }
    })
    setBusy(false)
    if (error) {
      setError(error.status === 429
        ? '短時間に送りすぎました。1分ほど待ってからもう一度送ってください。'
        : 'メールを送れませんでした。アドレスを確認してください。')
      return
    }
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

  return (
    <div className="center-screen">
      <div className="logo" aria-hidden="true"><span>舞</span></div>
      <div className="stack">
        <h1 className="page-title">舞研アプリにログイン</h1>
        {message && <div className="notice info">{message}</div>}
      </div>

      {!sent ? (
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
      {error && <div className="notice error" role="alert">{error}</div>}
    </div>
  )
}
