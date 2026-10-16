import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { fmtDate, fmtTime } from '../lib/dates'
import { ChevronLeft } from '../components/Icons'

// ベルの中身。開くと全部「既読」になる
export default function Notifications() {
  const { member } = useSession()
  const navigate = useNavigate()
  const [list, setList] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(60)
      if (!alive) return
      setList(data ?? [])
      if ((data ?? []).some((n) => !n.read_at)) {
        await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('member_id', member.id).is('read_at', null)
        window.dispatchEvent(new Event('notifications-read'))
      }
    })()
    return () => { alive = false }
  }, [member.id])

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <Link to="/" className="icon-btn plain" aria-label="ホームへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">お知らせ</h1>
        </div>
      </div>
      {!list ? (
        <><div className="card skeleton" style={{ height: 72 }} /><div className="card skeleton" style={{ height: 72 }} /></>
      ) : list.length === 0 ? (
        <div className="card empty">まだお知らせはありません</div>
      ) : (
        <div className="card" style={{ padding: '4px 16px' }}>
          {list.map((n) => (
            <button key={n.id} type="button" className="list-row notif-row" onClick={() => n.url && navigate(n.url)}>
              <span className={`notif-dot${n.read_at ? ' read' : ''}`} aria-hidden="true" />
              <span className="stack grow" style={{ gap: 2, textAlign: 'left' }}>
                <span style={{ fontWeight: 800 }}>{n.title}</span>
                {n.body && <span style={{ fontSize: 14 }}>{n.body}</span>}
                <span className="sub">{fmtDate(n.created_at)} {fmtTime(n.created_at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
