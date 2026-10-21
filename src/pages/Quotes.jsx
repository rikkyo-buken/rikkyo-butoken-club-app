import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { ChevronLeft, PlusIcon } from '../components/Icons'
import Sheet from '../components/Sheet'

// 幹部用：きょうのひとことの追加・編集
export default function Quotes() {
  const { isOfficer } = useSession()
  const [list, setList] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('quotes').select('*').order('created_at', { ascending: false })
    setList(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function toggle(q) {
    await supabase.from('quotes').update({ active: !q.active }).eq('id', q.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <Link to="/" className="icon-btn plain" aria-label="ホームへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">きょうのひとこと</h1>
        </div>
        {isOfficer && <button className="btn btn-small btn-primary" onClick={() => setEditing({})}><PlusIcon /> 追加</button>}
      </div>
      <p className="sub" style={{ margin: 0 }}>アプリを開くたびに、表示中のものからランダムで1つがホームに出ます。</p>
      {!list ? <div className="card skeleton" style={{ height: 96 }} /> : list.map((q) => (
        <div key={q.id} className="card stack" style={{ gap: 8, opacity: q.active ? 1 : 0.55 }}>
          <span style={{ lineHeight: 1.7 }}>{q.body}</span>
          {q.signature && <span className="sub">— {q.signature}</span>}
          {isOfficer && (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-small btn-ghost" onClick={() => toggle(q)}>{q.active ? '表示しない' : '表示する'}</button>
              <button className="btn btn-small" onClick={() => setEditing(q)}>編集</button>
            </div>
          )}
        </div>
      ))}
      {editing && <QuoteSheet initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function QuoteSheet({ initial, onClose, onSaved }) {
  const { member } = useSession()
  const [body, setBody] = useState(initial.body ?? '')
  const [sign, setSign] = useState(initial.signature ?? '')
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    const row = { body: body.trim(), signature: sign.trim() || null }
    const res = initial.id
      ? await supabase.from('quotes').update(row).eq('id', initial.id)
      : await supabase.from('quotes').insert({ ...row, created_by: member.id })
    if (res.error) { setError(res.error.message); return }
    onSaved()
  }
  async function remove() {
    if (!window.confirm('このひとことを削除しますか？')) return
    await supabase.from('quotes').delete().eq('id', initial.id)
    onSaved()
  }

  return (
    <Sheet title={initial.id ? 'ひとことを編集' : 'ひとことを追加'} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <label className="field"><span>ひとこと（200文字まで）</span>
          <textarea className="textarea" required maxLength={200} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <label className="field"><span>添える名前（任意。例：主将より）</span>
          <input className="input" value={sign} onChange={(e) => setSign(e.target.value)} />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={!body.trim()}>保存する</button>
        {initial.id && <button type="button" className="btn btn-danger btn-block" onClick={remove}>削除する</button>}
      </form>
    </Sheet>
  )
}
