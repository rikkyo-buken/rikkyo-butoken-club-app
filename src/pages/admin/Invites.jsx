import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'
import { fmtDate } from '../../lib/dates'
import { ChevronLeft } from '../../components/Icons'

// 管理者用：招待リンクの発行と一覧
export default function Invites() {
  const { member } = useSession()
  const [invites, setInvites] = useState([])
  const [days, setDays] = useState(14)
  const [maxUses, setMaxUses] = useState(50)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('invites').select('*').order('created_at', { ascending: false })
    setInvites(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const linkOf = (inv) => `${window.location.origin}/join/${inv.token}`

  async function create() {
    setBusy(true)
    setError('')
    const { error } = await supabase.from('invites').insert({
      created_by: member.id,
      expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      max_uses: maxUses
    })
    setBusy(false)
    if (error) { setError('発行できませんでした'); return }
    load()
  }

  async function share(inv) {
    const url = linkOf(inv)
    if (navigator.share) {
      try { await navigator.share({ title: '舞研アプリの招待', text: '舞研アプリに登録してください', url }); return } catch { /* キャンセル時はコピーへ */ }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(inv.id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      window.prompt('このリンクをコピーしてください', url)
    }
  }

  async function revoke(inv) {
    if (!window.confirm('この招待リンクを無効にしますか？')) return
    await supabase.from('invites').delete().eq('id', inv.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <Link to="/members" className="icon-btn" style={{ background: 'transparent', boxShadow: 'none', border: 0, color: 'var(--ink)' }} aria-label="部員リストへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">招待リンク</h1>
        </div>
      </div>

      <div className="card stack" style={{ gap: 12 }}>
        <div className="grid-2">
          <label className="field"><span>有効期限</span>
            <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>1日</option><option value={7}>1週間</option>
              <option value={14}>2週間</option><option value={30}>1か月</option>
            </select>
          </label>
          <label className="field"><span>使える人数</span>
            <select className="select" value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))}>
              <option value={1}>1人</option><option value={10}>10人</option>
              <option value={50}>50人</option><option value={100}>100人</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={create}>新しい招待リンクを発行</button>
        <span className="sub">リンクを知っている人は誰でも登録できます。部員のLINEグループなど、限られた場所でだけ共有してください。</span>
        {error && <div className="notice error">{error}</div>}
      </div>

      <h2 className="section-title">発行済み</h2>
      {invites.length === 0 && <div className="card empty">まだありません</div>}
      {invites.map((inv) => {
        const expired = new Date(inv.expires_at) < new Date() || inv.used_count >= inv.max_uses
        return (
          <div key={inv.id} className="card stack" style={{ gap: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className={`chip ${expired ? '' : 'green'}`}>{expired ? '無効' : '有効'}</span>
              <span className="sub">{fmtDate(inv.expires_at)}まで・{inv.used_count}/{inv.max_uses}人が使用</span>
            </div>
            {!expired && (
              <div className="row">
                <button className="btn btn-small btn-yellow grow" onClick={() => share(inv)}>{copied === inv.id ? 'コピーしました' : 'リンクを共有・コピー'}</button>
                <button className="btn btn-small btn-danger" onClick={() => revoke(inv)}>無効にする</button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
