import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { COMPETITION_STATUS, DANCES, ENTRY_STATUS, targetLabel } from '../lib/constants'
import { fmtDate, fmtTime, fromInputs, toDateInput, toTimeInput } from '../lib/dates'
import { fmtYmd, todayInput } from '../lib/format'
import GradePicker from '../components/GradePicker'
import Sheet from '../components/Sheet'
import { ChevronLeft, PlusIcon } from '../components/Icons'

const ALL_DANCES = [...DANCES.latin, ...DANCES.standard]

export default function Contest() {
  const { hasRole } = useSession()
  const canManage = hasRole('captain', 'vice_captain')
  const [list, setList] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('competitions').select('*').order('held_on', { ascending: false })
    setList(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  if (openId) return <Detail id={openId} onBack={() => { setOpenId(null); load() }} />

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">大会</h1>
        {canManage && <button className="btn btn-small btn-primary" onClick={() => setCreating(true)}><PlusIcon /> 大会を登録</button>}
      </div>
      {!list ? <SkeletonCards /> : list.length === 0 ? (
        <div className="card empty">登録された大会はありません</div>
      ) : list.map((c) => {
        const st = COMPETITION_STATUS[c.status]
        const open = c.status === 'recruiting' && new Date(c.request_deadline) > new Date()
        return (
          <button key={c.id} type="button" className={`card stack tappable ${open ? 'tint-pink' : ''}`} style={{ gap: 6, textAlign: 'left' }} onClick={() => setOpenId(c.id)}>
            <div className="row" style={{ gap: 6 }}>
              <span className={`chip ${open ? 'primary' : st.chip}`}>{open ? '募集中' : c.status === 'recruiting' ? '募集締切' : st.label}</span>
              {targetLabel(c.target_grades) && <span className="chip soft">{targetLabel(c.target_grades)}</span>}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</span>
            <span className="sub" style={{ color: 'var(--ink)' }}>
              開催 {fmtYmd(c.held_on)}{open ? `・締切 ${fmtDate(c.request_deadline)} ${fmtTime(c.request_deadline)}` : ''}
            </span>
          </button>
        )
      })}
      {creating && <CompetitionForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); load(); if (id) setOpenId(id) }} />}
    </div>
  )
}

export function SkeletonCards({ n = 3 }) {
  return Array.from({ length: n }, (_, i) => <div key={i} className="card skeleton" style={{ height: 96 }} />)
}

// ================= 大会の詳細 =================
function Detail({ id, onBack }) {
  const { member, hasRole } = useSession()
  const canManage = hasRole('captain', 'vice_captain')
  const [comp, setComp] = useState(null)
  const [dances, setDances] = useState([])
  const [entries, setEntries] = useState([])
  const [partner, setPartner] = useState(null)
  const [editingComp, setEditingComp] = useState(false)
  const [entryForm, setEntryForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data: c }, { data: d }, { data: e }, { data: p }] = await Promise.all([
      supabase.from('competitions').select('*').eq('id', id).maybeSingle(),
      supabase.from('competition_dances').select('dance').eq('competition_id', id),
      supabase.from('entries').select('*, member:members!entries_member_id_fkey(id, nickname, full_name, position)').eq('competition_id', id).order('created_at'),
      member.partner_id ? supabase.from('members').select('nickname').eq('id', member.partner_id).maybeSingle() : Promise.resolve({ data: null })
    ])
    setComp(c)
    const ds = (d ?? []).map((x) => x.dance)
    setDances(ALL_DANCES.filter((x) => ds.includes(x)).concat(ds.filter((x) => !ALL_DANCES.includes(x))))
    setEntries(e ?? [])
    setPartner(p)
  }, [id, member.partner_id])
  useEffect(() => { load() }, [load])

  if (!comp) return <div className="page"><SkeletonCards n={2} /></div>

  const open = comp.status === 'recruiting' && new Date(comp.request_deadline) > new Date()
  const mine = entries.find((e) => e.member_id === member.id)
  const myPartnerName = mine?.partner_id ? entries.find((e) => e.member_id === mine.partner_id)?.member.nickname : null

  // ペアごとにまとめて表示する
  const groups = []
  const seen = new Set()
  for (const e of entries) {
    if (seen.has(e.member_id)) continue
    const p = e.partner_id ? entries.find((x) => x.member_id === e.partner_id) : null
    seen.add(e.member_id)
    if (p) seen.add(p.member_id)
    const pair = [e, p].filter(Boolean).sort((a, b) => (a.member.position === 'leader' ? -1 : 1) - (b.member.position === 'leader' ? -1 : 1))
    groups.push(pair)
  }

  async function enterNow() {
    setBusy(true); setError('')
    const { error } = await supabase.rpc('submit_entry', { p_competition_id: comp.id, p_dances: [] })
    setBusy(false)
    if (error) setError(error.message); else load()
  }
  async function withdraw() {
    if (!window.confirm(myPartnerName ? `${myPartnerName}さんの分も一緒に取り消されます。よろしいですか？` : 'エントリーを取り消しますか？')) return
    setBusy(true); setError('')
    const { error } = await supabase.rpc('withdraw_entry', { p_competition_id: comp.id })
    setBusy(false)
    if (error) setError(error.message); else load()
  }
  async function setStatus(status) {
    await supabase.from('competitions').update({ status }).eq('id', comp.id)
    load()
  }
  async function removeGroup(pair) {
    if (!window.confirm(`${pair.map((e) => e.member.nickname).join('・')} のエントリーを取り消しますか？`)) return
    await supabase.from('entries').delete().in('id', pair.map((e) => e.id))
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <button className="icon-btn plain" aria-label="大会一覧へ戻る" onClick={onBack}><ChevronLeft /></button>
          <h1 className="page-title" style={{ fontSize: 20 }}>{comp.name}</h1>
        </div>
        {canManage && <button className="btn btn-small" onClick={() => setEditingComp(true)}>編集</button>}
      </div>

      <div className="card stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className={`chip ${open ? 'primary' : COMPETITION_STATUS[comp.status].chip}`}>{open ? '募集中' : comp.status === 'recruiting' ? '募集締切' : COMPETITION_STATUS[comp.status].label}</span>
          {targetLabel(comp.target_grades) && <span className="chip soft">{targetLabel(comp.target_grades)}</span>}
        </div>
        <span>開催日：<b>{fmtYmd(comp.held_on)}</b></span>
        <span>エントリー締切：<b>{fmtDate(comp.request_deadline)} {fmtTime(comp.request_deadline)}</b></span>
        {dances.length > 0 ? (
          <div className="choice-row" style={{ marginTop: 4 }}>{dances.map((d) => <span key={d} className="chip">{d}</span>)}</div>
        ) : <span className="sub">種目の選択はありません</span>}
      </div>

      <h2 className="section-title">自分のエントリー</h2>
      {mine ? (
        <div className="card tint-mint stack pop-in" style={{ gap: 8 }}>
          <span className={`chip ${ENTRY_STATUS[mine.status].chip}`} style={{ alignSelf: 'flex-start' }}>{ENTRY_STATUS[mine.status].label}</span>
          <span style={{ fontWeight: 800 }}>{myPartnerName ? `${myPartnerName}さんとペアでエントリー` : '1人でエントリー'}</span>
          {mine.dances.length > 0 && <span>種目：{mine.dances.join('・')}</span>}
          {open && (
            <div className="grid-2">
              <button className="btn btn-small btn-danger" disabled={busy} onClick={withdraw}>取り消す</button>
              {dances.length > 0 && <button className="btn btn-small" onClick={() => setEntryForm(true)}>種目を変更</button>}
            </div>
          )}
        </div>
      ) : open ? (
        <div className="card stack" style={{ gap: 10 }}>
          <span>{partner ? `ペアの${partner.nickname}さんも一緒にエントリーされます。` : 'ペアが未設定なので、1人でのエントリーになります。'}</span>
          {!partner && <Link to="/me" className="sub">プロフィールでペアを設定する</Link>}
          {dances.length > 0
            ? <button className="btn btn-primary" onClick={() => setEntryForm(true)}>種目を選んでエントリー</button>
            : <button className="btn btn-primary" disabled={busy} onClick={enterNow}>{busy ? '送信中…' : 'エントリーする'}</button>}
        </div>
      ) : (
        <div className="card empty">エントリーしていません</div>
      )}
      {error && <div className="notice error">{error}</div>}

      <h2 className="section-title">エントリーした人（{entries.length}人）</h2>
      {groups.length === 0 && <div className="card empty">まだエントリーはありません</div>}
      {groups.length > 0 && (
        <div className="card" style={{ padding: '6px 16px' }}>
          {groups.map((pair) => (
            <div key={pair[0].id} className="list-row">
              <div className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 800 }}>{pair.map((e) => e.member.nickname).join(' × ')}</span>
                {pair[0].dances.length > 0 && <span className="sub">{pair[0].dances.join('・')}</span>}
              </div>
              {canManage && <button className="btn btn-small btn-ghost" onClick={() => removeGroup(pair)}>取消</button>}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="stack">
          {comp.status === 'recruiting' && <button className="btn" onClick={() => setStatus('confirmed')}>募集を締め切る</button>}
          {comp.status === 'confirmed' && <button className="btn" onClick={() => setStatus('recruiting')}>募集を再開する</button>}
          {comp.status !== 'finished' && <button className="btn btn-ghost" onClick={() => setStatus('finished')}>大会を終了にする</button>}
          <p className="sub" style={{ margin: 0 }}>エントリー費は、財務が「お金 → 会計 → 新しい請求 → 大会のエントリー者」から請求します。</p>
        </div>
      )}

      {editingComp && <CompetitionForm initial={comp} initialDances={dances} onClose={() => setEditingComp(false)} onSaved={() => { setEditingComp(false); load() }} />}
      {entryForm && <EntryForm comp={comp} dances={dances} current={mine?.dances} partnerName={partner?.nickname} onClose={() => setEntryForm(false)} onSaved={() => { setEntryForm(false); load() }} />}
    </div>
  )
}

function EntryForm({ comp, dances, current, partnerName, onClose, onSaved }) {
  const [picked, setPicked] = useState(current ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const toggle = (d) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.rpc('submit_entry', { p_competition_id: comp.id, p_dances: picked })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Sheet title="エントリー" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <div className="field">
          <span>出たい種目</span>
          <div className="choice-row">
            {dances.map((d) => <button key={d} type="button" className="choice" aria-pressed={picked.includes(d)} onClick={() => toggle(d)}>{d}</button>)}
          </div>
        </div>
        <p className="sub" style={{ margin: 0 }}>{partnerName ? `ペアの${partnerName}さんも同じ種目でエントリーされます。` : '1人でのエントリーになります。'}締切までは変更できます。</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || picked.length === 0}>{busy ? '送信中…' : 'エントリーする'}</button>
      </form>
    </Sheet>
  )
}

// 主将・副将：大会の登録・編集
function CompetitionForm({ initial, initialDances = [], onClose, onSaved }) {
  const isNew = !initial
  const dl = initial ? new Date(initial.request_deadline) : null
  const [f, setF] = useState({
    name: initial?.name ?? '',
    held_on: initial?.held_on ?? todayInput(30),
    deadline_date: dl ? toDateInput(dl) : todayInput(14),
    deadline_time: dl ? toTimeInput(dl) : '23:59',
    target_grades: initial?.target_grades ?? []
  })
  const [useDances, setUseDances] = useState(isNew ? true : initialDances.length > 0)
  const [dances, setDances] = useState(isNew ? [...DANCES.latin] : initialDances)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))
  const toggle = (d) => setDances((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const row = {
      name: f.name.trim(), held_on: f.held_on,
      request_deadline: fromInputs(f.deadline_date, f.deadline_time).toISOString(),
      target_grades: f.target_grades.length ? f.target_grades : null
    }
    let id = initial?.id
    if (isNew) {
      const { data, error } = await supabase.from('competitions').insert(row).select('id').single()
      if (error) { setBusy(false); setError(error.message); return }
      id = data.id
    } else {
      const { error } = await supabase.from('competitions').update(row).eq('id', id)
      if (error) { setBusy(false); setError(error.message); return }
      await supabase.from('competition_dances').delete().eq('competition_id', id)
    }
    const list = useDances ? dances : []
    if (list.length) await supabase.from('competition_dances').insert(list.map((dance) => ({ competition_id: id, dance })))
    setBusy(false)
    onSaved(isNew ? id : null)
  }

  async function remove() {
    if (!window.confirm('この大会を削除しますか？エントリーも消えます。')) return
    await supabase.from('competitions').delete().eq('id', initial.id)
    window.location.reload()
  }

  return (
    <Sheet title={isNew ? '大会を登録' : '大会を編集'} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <label className="field"><span>大会名</span>
          <input className="input" required value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="秋季大会" />
        </label>
        <label className="field"><span>開催日</span>
          <input className="input" type="date" required value={f.held_on} onChange={(e) => set('held_on', e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field"><span>エントリー締切日</span>
            <input className="input" type="date" required value={f.deadline_date} onChange={(e) => set('deadline_date', e.target.value)} />
          </label>
          <label className="field"><span>時刻</span>
            <input className="input" type="time" required value={f.deadline_time} onChange={(e) => set('deadline_time', e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>種目</span>
          <div className="choice-row">
            <button type="button" className="choice" aria-pressed={useDances} onClick={() => setUseDances(true)}>種目を選んでもらう</button>
            <button type="button" className="choice" aria-pressed={!useDances} onClick={() => setUseDances(false)}>種目の選択なし</button>
          </div>
          {useDances && (
            <>
              <span className="sub">ラテン</span>
              <div className="choice-row">{DANCES.latin.map((d) => <button key={d} type="button" className="choice" aria-pressed={dances.includes(d)} onClick={() => toggle(d)}>{d}</button>)}</div>
              <span className="sub">スタンダード</span>
              <div className="choice-row">{DANCES.standard.map((d) => <button key={d} type="button" className="choice" aria-pressed={dances.includes(d)} onClick={() => toggle(d)}>{d}</button>)}</div>
            </>
          )}
        </div>
        <GradePicker value={f.target_grades} onChange={(v) => set('target_grades', v)} />
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || (useDances && dances.length === 0)}>{busy ? '保存中…' : '保存する'}</button>
        {!isNew && <button type="button" className="btn btn-danger btn-block" onClick={remove}>大会を削除する</button>}
      </form>
    </Sheet>
  )
}
