import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { EQUIPMENT_STATUS } from '../lib/constants'
import { compressImage, fmtYmd, todayInput } from '../lib/format'
import Sheet from '../components/Sheet'
import { BoxIcon, PlusIcon } from '../components/Icons'

const BUCKET = 'equipment-photos'
const STATE_CHIP = { available: 'green', lent: 'orange', dress_rental: 'pink', repair: '' }

export default function Equipment() {
  const { member, hasRole } = useSession()
  const canManage = hasRole('equipment')
  const [items, setItems] = useState(null)
  const [loans, setLoans] = useState([])
  const [photos, setPhotos] = useState({})
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [borrowing, setBorrowing] = useState(null)
  const [editing, setEditing] = useState(null)
  const [zoom, setZoom] = useState(null)

  const load = useCallback(async () => {
    const [{ data: eq }, { data: ln }] = await Promise.all([
      supabase.from('equipment').select('*').neq('status', 'disposed').order('name'),
      supabase.from('loans').select('*, borrower:members(id, nickname)').in('status', ['requested', 'lent']).order('created_at')
    ])
    setItems(eq ?? [])
    setLoans(ln ?? [])
    const paths = (eq ?? []).map((e) => e.photo_path).filter(Boolean)
    if (paths.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      const map = {}
      for (const s of data ?? []) if (s.signedUrl) map[s.path] = s.signedUrl
      setPhotos(map)
    }
  }, [])
  useEffect(() => { load() }, [load])

  // 備品ごとの状態（貸出中かどうかは貸出記録から決める）
  const view = useMemo(() => (items ?? []).map((e) => {
    const lent = loans.find((l) => l.equipment_id === e.id && l.status === 'lent')
    const requests = loans.filter((l) => l.equipment_id === e.id && l.status === 'requested')
    const state = e.status === 'repair' || e.status === 'dress_rental' ? e.status : lent ? 'lent' : 'available'
    return { ...e, lent, requests, state }
  }), [items, loans])

  const shown = view.filter((e) => (filter === 'all' || e.state === filter) && (!q || e.name.includes(q)))
  const myLoans = loans.filter((l) => l.borrower_id === member.id)
  const requestsAll = loans.filter((l) => l.status === 'requested')
  const nameOf = (id) => items?.find((e) => e.id === id)?.name ?? ''

  async function setLoan(loan, patch) {
    const { error } = await supabase.from('loans').update(patch).eq('id', loan.id)
    if (error) window.alert(error.message)
    load()
  }
  async function cancel(loan) {
    if (!window.confirm('借用の申請を取り消しますか？')) return
    await supabase.from('loans').delete().eq('id', loan.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">備品</h1>
        {canManage && <button className="btn btn-small btn-primary" onClick={() => setEditing({})}><PlusIcon /> 登録</button>}
      </div>

      {myLoans.length > 0 && (
        <div className="card tint-yellow stack" style={{ gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>自分の借用</span>
          {myLoans.map((l) => (
            <div key={l.id} className="row">
              <span className="grow" style={{ fontWeight: 800 }}>{nameOf(l.equipment_id)}</span>
              {l.status === 'lent'
                ? <span className={`chip ${l.due_on && l.due_on < todayInput() ? 'red' : 'orange'}`}>返却 {fmtYmd(l.due_on)}</span>
                : <button className="btn btn-small" onClick={() => cancel(l)}>申請を取り消す</button>}
            </div>
          ))}
        </div>
      )}

      {canManage && requestsAll.length > 0 && (
        <div className="card stack" style={{ gap: 4 }}>
          <span style={{ fontWeight: 800 }}>借用の申請（{requestsAll.length}件）</span>
          {requestsAll.map((l) => (
            <div key={l.id} className="list-row" style={{ flexWrap: 'wrap' }}>
              <div className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 800 }}>{nameOf(l.equipment_id)}</span>
                <span className="sub">{l.borrower.nickname}・返却予定 {fmtYmd(l.due_on)}</span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-small btn-danger nowrap" onClick={() => setLoan(l, { status: 'rejected' })}>断る</button>
                <button className="btn btn-small btn-primary nowrap" onClick={() => setLoan(l, { status: 'lent' })}>貸し出す</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <label className="row card" style={{ padding: '4px 16px', borderRadius: 999 }}>
        <span className="visually-hidden">備品名で検索</span>
        <input className="input" style={{ border: 0, boxShadow: 'none', padding: 0 }} type="search" placeholder="備品名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="filter-row">
        {[['all', 'すべて'], ['available', '貸出可'], ['lent', '貸出中'], ['dress_rental', 'ドレスレンタル中'], ['repair', '修理中']].map(([k, l]) => (
          <button key={k} className="filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {!items ? <><div className="card skeleton" style={{ height: 96 }} /><div className="card skeleton" style={{ height: 96 }} /></> : shown.length === 0 ? (
        <div className="card empty">該当する備品はありません</div>
      ) : shown.map((e) => {
        const mineRequested = e.requests.some((r) => r.borrower_id === member.id)
        return (
          <div key={e.id} className="card equip-card" style={{ padding: 0, overflow: 'hidden' }}>
            {e.photo_path && photos[e.photo_path] ? (
              <button type="button" className="equip-photo" onClick={() => setZoom({ src: photos[e.photo_path], name: e.name })} aria-label={`${e.name}の写真を拡大`}>
                <img src={photos[e.photo_path]} alt="" loading="lazy" />
                <span className={`chip state-chip ${STATE_CHIP[e.state]}`}>{e.state === 'lent' ? '貸出中' : EQUIPMENT_STATUS[e.state]}</span>
              </button>
            ) : null}
            <div className="row" style={{ padding: 14, gap: 12, alignItems: 'flex-start' }}>
              {!(e.photo_path && photos[e.photo_path]) && <div className="thumb"><BoxIcon /></div>}
              <div className="stack grow" style={{ gap: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 16 }}>{e.name}</span>
                <span className="sub">
                  {e.state === 'lent' ? `${e.lent.borrower.nickname} が借用中・返却 ${fmtYmd(e.lent.due_on)}` : e.location || ''}
                </span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  {!(e.photo_path && photos[e.photo_path]) && (
                    <span className={`chip ${STATE_CHIP[e.state]}`}>{e.state === 'lent' ? '貸出中' : EQUIPMENT_STATUS[e.state]}</span>
                  )}
                  {canManage && e.requests.length > 0 && <span className="chip primary">申請 {e.requests.length}件</span>}
                  {mineRequested && <span className="chip orange">申請中</span>}
                </div>
                {e.note && <span className="sub" style={{ whiteSpace: 'pre-wrap' }}>{e.note}</span>}
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {e.state === 'available' && !mineRequested && <button className="btn btn-small" onClick={() => setBorrowing(e)}>借りる</button>}
                {canManage && e.state === 'lent' && <button className="btn btn-small btn-yellow" onClick={() => setLoan(e.lent, { status: 'returned' })}>返却</button>}
                {canManage && <button className="btn btn-small btn-ghost" onClick={() => setEditing(e)}>編集</button>}
              </div>
            </div>
          </div>
        )
      })}

      {zoom && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={zoom.name} onClick={() => setZoom(null)}>
          <img src={zoom.src} alt={zoom.name} />
          <span className="lightbox-caption">{zoom.name}（タップで閉じる）</span>
        </div>
      )}

      {borrowing && <BorrowSheet item={borrowing} onClose={() => setBorrowing(null)} onSaved={() => { setBorrowing(null); load() }} />}
      {editing && <EquipmentForm initial={editing} photoUrl={photos[editing.photo_path]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function BorrowSheet({ item, onClose, onSaved }) {
  const { member } = useSession()
  const [due, setDue] = useState(todayInput(7))
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('loans').insert({ equipment_id: item.id, borrower_id: member.id, due_on: due })
    if (error) { setError(error.message); return }
    onSaved()
  }
  return (
    <Sheet title={`${item.name} を借りる`} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <label className="field"><span>返す予定の日</span>
          <input className="input" type="date" required min={todayInput()} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <p className="sub" style={{ margin: 0 }}>備品管理が確認すると「貸出中」になります。</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block">借用を申請する</button>
      </form>
    </Sheet>
  )
}

// 備品管理：登録・編集（写真は縮めてから保存）
function EquipmentForm({ initial, photoUrl, onClose, onSaved }) {
  const isNew = !initial.id
  const [f, setF] = useState({ name: initial.name ?? '', location: initial.location ?? '', note: initial.note ?? '', status: initial.status ?? 'available' })
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(photoUrl ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  function pick(e) {
    const fl = e.target.files?.[0]
    if (!fl) return
    setFile(fl)
    setPreview(URL.createObjectURL(fl))
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      let photo_path = initial.photo_path ?? null
      if (file) {
        const blob = await compressImage(file)
        const path = `${crypto.randomUUID()}.jpg`
        const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
        if (error) throw error
        if (photo_path) await supabase.storage.from(BUCKET).remove([photo_path])
        photo_path = path
      }
      const row = { name: f.name.trim(), location: f.location.trim() || null, note: f.note.trim() || null, status: f.status, photo_path }
      const res = isNew ? await supabase.from('equipment').insert(row) : await supabase.from('equipment').update(row).eq('id', initial.id)
      if (res.error) throw res.error
      onSaved()
    } catch (err) {
      setError(err.message || '保存できませんでした')
      setBusy(false)
    }
  }

  return (
    <Sheet title={isNew ? '備品を登録' : '備品を編集'} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <label className="field"><span>写真</span>
          {preview && <img src={preview} alt="" style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 20 }} />}
          <input type="file" accept="image/*" onChange={pick} />
        </label>
        <label className="field"><span>名前</span>
          <input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="ポータブルスピーカー" />
        </label>
        <label className="field"><span>保管場所</span>
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="部室 棚A" />
        </label>
        <div className="field"><span>状態</span>
          <div className="choice-row">
            {Object.entries(EQUIPMENT_STATUS).map(([k, l]) => (
              <button key={k} type="button" className="choice" aria-pressed={f.status === k} onClick={() => set('status', k)}>{l}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>メモ</span>
          <textarea className="textarea" value={f.note} onChange={(e) => set('note', e.target.value)} />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '保存中…' : '保存する'}</button>
      </form>
    </Sheet>
  )
}
