import { supabase } from '../lib/supabase'

// 引退した部員、招待から登録していない人に出す画面
export function Retired() {
  return (
    <Screen title="引退済みです"
      body="このアカウントは引退扱いになっているため、アプリは使えません。間違いの場合は管理者に連絡してください。" />
  )
}

export function NoInvite() {
  return (
    <Screen title="招待リンクから登録してください"
      body="舞研アプリは部員専用です。幹部から送られた招待リンクを開いて、もう一度ログインしてください。" />
  )
}

function Screen({ title, body }) {
  return (
    <div className="center-screen">
      <div className="logo" aria-hidden="true"><span>舞</span></div>
      <h1 className="page-title">{title}</h1>
      <p style={{ lineHeight: 1.7, margin: 0 }}>{body}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>ログアウト</button>
    </div>
  )
}
