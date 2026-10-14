import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { WEEKDAYS, fmtDate, fmtTime } from '../lib/dates'
import { targetLabel } from '../lib/constants'
import GradePicker from '../components/GradePicker'
import Sheet from '../components/Sheet'

export default function Home() {
  const { member, isOfficer } = useSession()
  const [next, setNext] = useState([])
  const [news, setNews] = useState([])
  const [posting, setPosting] = useState(false)
  const now = new Date()

  const load = useCallback(async () => {
    const [{ data: ev }, { data: an }] = await Promise.all([
      supabase.from('events').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(3),
      supabase.from('announcements').select('*, author:members(nickname)').order('created_at', { ascending: false }).limit(10)
    ])
    setNext(ev ?? [])
    setNews(an ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  const first = next[0]

  return (
    <div className="page">
      <div className="page-header">
        <div className="stack" style={{ gap: 2 }}>
          <span className="sub" style={{ fontWeight: 700 }}>{now.getMonth() + 1}月{now.getDate()}日（{WEEKDAYS[now.getDay()]}）</span>
          <h1 className="page-title">おつかれ、{member.nickname}！</h1>
        </div>
        <Link to="/me" className="icon-btn" aria-label="プロフィール" style={{ textDecoration: 'none', color: 'var(--ink)', fontWeight: 900 }}>
          {member.nickname.slice(0, 1)}
        </Link>
      </div>

      <Link to="/schedule" className="card tint-mint" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="stack" style={{ gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>次の予定</span>
          {first ? (
            <>
              <span style={{ fontSize: 20, fontWeight: 900 }}>{fmtDate(first.starts_at)} {first.title}</span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{fmtTime(first.starts_at)}–{fmtTime(first.ends_at)}{first.location ? `・${first.location}` : ''}</span>
              {next.slice(1).map((e) => (
                <span key={e.id} className="sub" style={{ color: 'var(--ink)' }}>{fmtDate(e.starts_at)} {fmtTime(e.starts_at)} {e.title}</span>
              ))}
            </>
          ) : (
            <span style={{ fontSize: 15 }}>予定はまだ登録されていません</span>
          )}
        </div>
      </Link>

      <div className="grid-2">
        <Link to="/members" className="card tint-pink" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>部員リスト</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>見る</div>
        </Link>
        <Link to="/money" className="card tint-yellow" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>お金・大会・備品</div>
          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>準備中</div>
        </Link>
      </div>

      <div className="row">
        <h2 className="section-title grow">お知らせ</h2>
        {isOfficer && <button className="btn btn-small" onClick={() => setPosting(true)}>投稿する</button>}
      </div>
      {news.length === 0 ? (
        <div className="card empty">お知らせはありません</div>
      ) : (
        news.map((a) => (
          <div key={a.id} className="card stack" style={{ gap: 6 }}>
            <div className="row" style={{ gap: 6 }}>
              {targetLabel(a.target_grades) && <span className="chip primary">{targetLabel(a.target_grades)}</span>}
              <span className="sub">{a.author?.nickname ?? '幹部'}・{fmtDate(a.created_at)}</span>
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{a.body}</div>
          </div>
        ))
      )}

      {posting && <PostSheet onClose={() => setPosting(false)} onSaved={() => { setPosting(false); load() }} />}
    </div>
  )
}

function PostSheet({ onClose, onSaved }) {
  const { member } = useSession()
  const [body, setBody] = useState('')
  const [grades, setGrades] = useState([])
  const [days, setDays] = useState(14)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const expires = days ? new Date(Date.now() + days * 86400000).toISOString() : null
    const { error } = await supabase.from('announcements').insert({
      body: body.trim(), target_grades: grades.length ? grades : null, author_id: member.id, expires_at: expires
    })
    setBusy(false)
    if (error) { setError('投稿できませんでした'); return }
    onSaved()
  }

  return (
    <Sheet title="お知らせを投稿" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <label className="field"><span>本文</span>
          <textarea className="textarea" required value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <GradePicker value={grades} onChange={setGrades} />
        <label className="field"><span>表示する期間</span>
          <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>1週間</option>
            <option value={14}>2週間</option>
            <option value={30}>1か月</option>
            <option value={0}>ずっと</option>
          </select>
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !body.trim()}>{busy ? '投稿中…' : '投稿する'}</button>
      </form>
    </Sheet>
  )
}
