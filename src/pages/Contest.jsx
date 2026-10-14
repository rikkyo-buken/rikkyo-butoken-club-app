import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { COMPETITION_STATUS, DANCES, ENTRY_STATUS, POSITION_LABELS, targetLabel } from '../lib/constants'
import { fmtDate, fmtTime, fromInputs, toDateInput, toTimeInput } from '../lib/dates'
import { fmtYmd, todayInput, yen } from '../lib/format'
import GradePicker from '../components/GradePicker'
import Sheet from '../components/Sheet'
import { ChevronLeft, PlusIcon } from '../components/Icons'

const ENTRY_SELECT = '*, leader:members!entries_leader_id_fkey(id, nickname, full_name), partner:members!entries_partner_id_fkey(id, nickname, full_name)'

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
      {!list ? <p className="empty">読み込み中…</p> : list.length === 0 ? (
        <div className="card empty">登録された大会はありません</div>
      ) : list.map((c) => {
        const st = COMPETITION_STATUS[c.status]
        const open = c.status === 'recruiting' && new Date(c.request_deadline) > new Date()
        return (
          <button key={c.id} type="button" className={`card stack ${open ? 'tint-pink' : ''}`} style={{ gap: 6, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpenId(c.id)}>
            <div className="row" style={{ gap: 6 }}>
              <span className={`chip ${st.chip}`}>{st.label}</span>
              {targetLabel(c.target_grades) && <span className="chip soft">{targetLabel(c.target_grades)}</span>}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800 }}>{c.name}</span>
            <span className="sub" style={{ color: 'var(--ink)' }}>
              開催 {fmtYmd(c.held_on)}{c.status === 'recruiting' ? `・希望締切 ${fmtDate(c.request_deadline)} ${fmtTime(c.request_deadline)}` : ''}
            </span>
          </button>
        )
      })}
      {creating && <CompetitionForm onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); load(); if (id) setOpenId(id) }} />}
    </div>
  )
}

// ================= 大会の詳細 =================
function Detail({ id, onBack }) {
  const { member, hasRole } = useSession()
  const canManage = hasRole('captain', 'vice_captain')
  const [comp, setComp] = useState(null)
  const [dances, setDances] = useState([])
  const [entries, setEntries] = useState([])
  const [editingComp, setEditingComp] = useState(false)
  const [entryForm, setEntryForm] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [adjusting, setAdjusting] = useState(null)

  const load = useCallback(async () => {
    const [{ data: c }, { data: d }, { data: e }] = await Promise.all([
      supabase.from('competitions').select('*').eq('id', id).maybeSingle(),
      supabase.from('competition_dances').select('dance').eq('competition_id', id),
      supabase.from('entries').select(ENTRY_SELECT).eq('competition_id', id).order('created_at')
    ])
    setComp(c)
    setDances((d ?? []).map((x) => x.dance))
    setEntries(e ?? [])
  }, [id])
  useEffect(() => { load() }, [load])

  if (!comp) return <div className="page"><p className="empty">読み込み中…</p></div>

  const open = comp.status === 'recruiting' && new Date(comp.request_deadline) > new Date()
  const mine = entries.find((e) => e.leader_id === member.id || e.partner_id === member.id)
  const orderedDances = [...DANCES.latin, ...DANCES.standard].filter((d) => dances.includes(d)).concat(dances.filter((d) => ![...DANCES.latin, ...DANCES.standard].includes(d)))

  async function withdraw() {
    if (!window.confirm('希望を取り消しますか？')) return
    await supabase.from('entries').delete().eq('id', mine.id)
    load()
  }

  async function finish() {
    if (!window.confirm('この大会を「終了」にしますか？')) return
    await supabase.from('competitions').update({ status: 'finished' }).eq('id', comp.id)
    load()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <button className="icon-btn plain" aria-label="大会一覧へ戻る" onClick={onBack}><ChevronLeft /></button>
          <h1 className="page-title" style={{ fontSize: 20 }}>{comp.name}</h1>
        </div>
        {canManage && comp.status === 'recruiting' && <button className="btn btn-small" onClick={() => setEditingComp(true)}>編集</button>}
      </div>

      <div className="card stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className={`chip ${COMPETITION_STATUS[comp.status].chip}`}>{COMPETITION_STATUS[comp.status].label}</span>
          {targetLabel(comp.target_grades) && <span className="chip soft">{targetLabel(comp.target_grades)}</span>}
        </div>
        <span>開催日：<b>{fmtYmd(comp.held_on)}</b></span>
        <span>希望締切：<b>{fmtDate(comp.request_deadline)} {fmtTime(comp.request_deadline)}</b></span>
        <span>エントリー費：<b>1組 {yen(comp.entry_fee)}</b>（2人で半分ずつ）</span>
        <div className="choice-row" style={{ marginTop: 4 }}>
          {orderedDances.map((d) => <span key={d} className="chip">{d}</span>)}
        </div>
      </div>

      <h2 className="section-title">自分のエントリー</h2>
      {mine ? (
        <div className="card stack" style={{ gap: 8 }}>
          <span className={`chip ${ENTRY_STATUS[mine.status].chip}`} style={{ alignSelf: 'flex-start' }}>{ENTRY_STATUS[mine.status].label}</span>
          <span>カップル：<b>{mine.leader.nickname}（L）× {mine.partner.nickname}（P）</b></span>
          <span>希望種目：{mine.requested_dances.join('・') || 'なし'}</span>
          {mine.status === 'confirmed' && <span>確定種目：<b>{mine.confirmed_dances.join('・')}</b>・1組 {yen(mine.fee ?? comp.entry_fee)}</span>}
          {open && (
            <div className="grid-2">
              <button className="btn btn-small btn-danger" onClick={withdraw}>取り消す</button>
              <button className="btn btn-small" onClick={() => setEntryForm(true)}>変更する</button>
            </div>
          )}
        </div>
      ) : open ? (
        <button className="btn btn-primary" onClick={() => setEntryForm(true)}>希望を出す</button>
      ) : (
        <div className="card empty">エントリーしていません</div>
      )}

      {canManage && (
        <>
          <h2 className="section-title">エントリー一覧（{entries.length}組）</h2>
          {entries.length === 0 && <div className="card empty">まだ希望は出ていません</div>}
          {entries.map((e) => (
            <button key={e.id} type="button" className="card stack" style={{ gap: 6, textAlign: 'left', cursor: comp.status === 'recruiting' ? 'pointer' : 'default' }}
              onClick={() => comp.status === 'recruiting' && setAdjusting(e)}>
              <div className="row">
                <span className="grow" style={{ fontWeight: 800 }}>{e.leader.nickname} × {e.partner.nickname}</span>
                <span className={`chip ${ENTRY_STATUS[e.status].chip}`}>{ENTRY_STATUS[e.status].label}</span>
              </div>
              <span className="sub">希望：{e.requested_dances.join('・') || 'なし'}</span>
              {e.status === 'confirmed' && <span className="sub">確定：{e.confirmed_dances.join('・')}・{yen(e.fee ?? comp.entry_fee)}</span>}
            </button>
          ))}
          {comp.status === 'recruiting' && (
            <button className="btn btn-primary" onClick={() => setConfirming(true)}>大会を確定して請求を作る</button>
          )}
          {comp.status === 'confirmed' && <button className="btn" onClick={finish}>大会を終了にする</button>}
        </>
      )}

      {editingComp && <CompetitionForm initial={comp} initialDances={dances} onClose={() => setEditingComp(false)} onSaved={() => { setEditingComp(false); load() }} />}
      {entryForm && <EntryForm comp={comp} dances={orderedDances} existing={mine} entries={entries} onClose={() => setEntryForm(false)} onSaved={() => { setEntryForm(false); load() }} />}
      {adjusting && <AdjustSheet entry={adjusting} comp={comp} dances={orderedDances} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load() }} />}
      {confirming && <ConfirmSheet comp={comp} entries={entries} onClose={() => setConfirming(false)} onSaved={() => { setConfirming(false); load() }} />}
    </div>
  )
}

// 部員：カップルで希望を出す
function EntryForm({ comp, dances, existing, entries, onClose, onSaved }) {
  const { member } = useSession()
  const iAmLeader = existing ? existing.leader_id === member.id : member.position === 'leader'
  const [members, setMembers] = useState([])
  const [partnerId, setPartnerId] = useState(existing ? (iAmLeader ? existing.partner_id : existing.leader_id) : '')
  const [picked, setPicked] = useState(existing?.requested_dances ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('members').select('id, nickname, full_name, position').eq('status', 'active').order('nickname')
      .then(({ data }) => setMembers((data ?? []).filter((m) => m.id !== member.id)))
  }, [member.id])

  // すでに別の組で出ている人は選べない
  const taken = new Set(entries.filter((e) => e.id !== existing?.id).flatMap((e) => [e.leader_id, e.partner_id]))
  const toggle = (d) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const row = {
      competition_id: comp.id,
      leader_id: iAmLeader ? member.id : partnerId,
      partner_id: iAmLeader ? partnerId : member.id,
      requested_dances: picked
    }
    const res = existing
      ? await supabase.from('entries').update(row).eq('id', existing.id)
      : await supabase.from('entries').insert(row)
    setBusy(false)
    if (res.error) { setError(res.error.message); return }
    onSaved()
  }

  return (
    <Sheet title="エントリーの希望" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <p className="sub" style={{ margin: 0 }}>あなたは{iAmLeader ? 'リーダー' : 'パートナー'}として登録されます。</p>
        <label className="field"><span>{iAmLeader ? 'パートナー' : 'リーダー'}</span>
          <select className="select" required value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
            <option value="">選んでください</option>
            {members.map((m) => (
              <option key={m.id} value={m.id} disabled={taken.has(m.id)}>
                {m.nickname}（{m.full_name}・{POSITION_LABELS[m.position]}）{taken.has(m.id) ? ' 他の組で登録済み' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>希望する種目</span>
          <div className="choice-row">
            {dances.map((d) => <button key={d} type="button" className="choice" aria-pressed={picked.includes(d)} onClick={() => toggle(d)}>{d}</button>)}
          </div>
        </div>
        <p className="sub" style={{ margin: 0 }}>締切までは何度でも変更できます。締切後に主将・副将が確定します。</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || !partnerId || picked.length === 0}>{busy ? '送信中…' : '希望を出す'}</button>
      </form>
    </Sheet>
  )
}

// 主将・副将：組ごとに確定種目と金額を決める
function AdjustSheet({ entry, comp, dances, onClose, onSaved }) {
  const [picked, setPicked] = useState(entry.status === 'confirmed' ? entry.confirmed_dances : entry.requested_dances)
  const [fee, setFee] = useState(String(entry.fee ?? comp.entry_fee))
  const [error, setError] = useState('')
  const toggle = (d) => setPicked((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))

  async function save(status) {
    const patch = status === 'confirmed'
      ? { status, confirmed_dances: picked, fee: Number(fee || 0) }
      : { status, confirmed_dances: [], fee: null }
    const { error } = await supabase.from('entries').update(patch).eq('id', entry.id)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Sheet title={`${entry.leader.nickname} × ${entry.partner.nickname}`} onClose={onClose}>
      <div className="field">
        <span>出場する種目（希望：{entry.requested_dances.join('・') || 'なし'}）</span>
        <div className="choice-row">
          {dances.map((d) => <button key={d} type="button" className="choice" aria-pressed={picked.includes(d)} onClick={() => toggle(d)}>{d}</button>)}
        </div>
      </div>
      <label className="field"><span>この組のエントリー費（2人で半分ずつ）</span>
        <input className="input" inputMode="numeric" value={fee} onChange={(e) => setFee(e.target.value.replace(/\D/g, ''))} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={picked.length === 0} onClick={() => save('confirmed')}>この組を確定</button>
      <button className="btn btn-block" onClick={() => save('withdrawn')}>見送りにする</button>
      {entry.status !== 'requested' && <button className="btn btn-ghost" onClick={() => save('requested')}>希望中に戻す</button>}
    </Sheet>
  )
}

function ConfirmSheet({ comp, entries, onClose, onSaved }) {
  const [due, setDue] = useState(todayInput(14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmed = entries.filter((e) => e.status === 'confirmed')
  const pending = entries.filter((e) => e.status === 'requested')
  const total = confirmed.reduce((s, e) => s + (e.fee ?? comp.entry_fee), 0)

  async function run() {
    setBusy(true)
    const { error } = await supabase.rpc('confirm_competition', { p_competition_id: comp.id, p_due_date: due })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Sheet title="大会を確定する" onClose={onClose}>
      <div className="card stack" style={{ gap: 6 }}>
        <span>確定した組：<b>{confirmed.length}組</b>（合計 {yen(total)}）</span>
        {pending.length > 0 && <span className="notice error">まだ決めていない組が{pending.length}組あります。確定すると「見送り」になります。</span>}
      </div>
      <label className="field"><span>エントリー費の支払い締切</span>
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </label>
      <p className="sub" style={{ margin: 0 }}>確定すると、各組のリーダーとパートナーに半額ずつ請求が作られます。確定後は取り消せません。</p>
      {error && <div className="notice error">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy || confirmed.length === 0} onClick={run}>{busy ? '処理中…' : '確定して請求を作る'}</button>
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
    entry_fee: String(initial?.entry_fee ?? ''),
    target_grades: initial?.target_grades ?? []
  })
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
      entry_fee: Number(f.entry_fee || 0),
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
    if (dances.length) await supabase.from('competition_dances').insert(dances.map((dance) => ({ competition_id: id, dance })))
    setBusy(false)
    onSaved(isNew ? id : null)
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
          <label className="field"><span>希望の締切日</span>
            <input className="input" type="date" required value={f.deadline_date} onChange={(e) => set('deadline_date', e.target.value)} />
          </label>
          <label className="field"><span>時刻</span>
            <input className="input" type="time" required value={f.deadline_time} onChange={(e) => set('deadline_time', e.target.value)} />
          </label>
        </div>
        <label className="field"><span>エントリー費（カップル1組あたり）</span>
          <input className="input" inputMode="numeric" required value={f.entry_fee} onChange={(e) => set('entry_fee', e.target.value.replace(/\D/g, ''))} placeholder="円" />
        </label>
        <div className="field">
          <span>実施する種目</span>
          <span className="sub">ラテン</span>
          <div className="choice-row">{DANCES.latin.map((d) => <button key={d} type="button" className="choice" aria-pressed={dances.includes(d)} onClick={() => toggle(d)}>{d}</button>)}</div>
          <span className="sub">スタンダード</span>
          <div className="choice-row">{DANCES.standard.map((d) => <button key={d} type="button" className="choice" aria-pressed={dances.includes(d)} onClick={() => toggle(d)}>{d}</button>)}</div>
        </div>
        <GradePicker value={f.target_grades} onChange={(v) => set('target_grades', v)} />
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy || dances.length === 0}>{busy ? '保存中…' : '保存する'}</button>
      </form>
    </Sheet>
  )
}
