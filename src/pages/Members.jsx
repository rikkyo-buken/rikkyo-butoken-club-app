import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { GRADES, MAJOR_LABELS, POSITION_LABELS, ROLE_LABELS, ROLE_ORDER, currentFiscalYear, gradeOf, pastelFor } from '../lib/constants'
import { ChevronLeft, GearIcon, LinkIcon } from '../components/Icons'
import Sheet from '../components/Sheet'

export default function Members() {
  const { isAdmin } = useSession()
  const [members, setMembers] = useState([])
  const [rolesBy, setRolesBy] = useState({})
  const [filter, setFilter] = useState('all') // all | 1..4 | retired
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from('members').select('*').order('join_year').order('nickname'),
      supabase.from('member_roles').select('*')
    ])
    setMembers(m ?? [])
    const by = {}
    for (const x of r ?? []) (by[x.member_id] ??= []).push(x.role)
    setRolesBy(by)
  }, [])

  useEffect(() => { load() }, [load])

  const shown = members.filter((m) => {
    if (filter === 'retired') return m.status === 'retired'
    if (m.status !== 'active') return false
    return filter === 'all' || gradeOf(m.join_year) === filter
  })

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <Link to="/" className="icon-btn btn-ghost" style={{ background: 'transparent', boxShadow: 'none', border: 0, color: 'var(--ink)' }} aria-label="ホームへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">部員</h1>
        </div>
        <span className="sub">{shown.length}人</span>
      </div>

      {isAdmin && (
        <div className="grid-2">
          <Link to="/admin/invites" className="btn btn-yellow"><LinkIcon /> 招待リンク</Link>
          <Link to="/admin/grades" className="btn"><GearIcon /> 学年別の権限</Link>
        </div>
      )}

      <div className="filter-row">
        <button className="filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全員</button>
        {GRADES.map((g) => (
          <button key={g} className="filter" aria-pressed={filter === g} onClick={() => setFilter(g)}>{g}年</button>
        ))}
        <button className="filter" aria-pressed={filter === 'retired'} onClick={() => setFilter('retired')}>引退</button>
      </div>

      <div className="stack">
        {shown.length === 0 && <div className="card empty">該当する部員はいません</div>}
        {shown.map((m) => {
          const content = <MemberRow m={m} roles={rolesBy[m.id] ?? []} partnerName={members.find((x) => x.id === m.partner_id)?.nickname} />
          return isAdmin ? (
            <button key={m.id} type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer', padding: 12 }} onClick={() => setEditing(m)}>{content}</button>
          ) : (
            <div key={m.id} className="card" style={{ padding: 12 }}>{content}</div>
          )
        })}
      </div>

      {editing && (
        <MemberSheet m={editing} roles={rolesBy[editing.id] ?? []}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function MemberRow({ m, roles, partnerName }) {
  const sortedRoles = ROLE_ORDER.filter((r) => roles.includes(r))
  return (
    <div className="row" style={{ gap: 12 }}>
      <div className="avatar" style={{ background: pastelFor(m.nickname) }}>{m.nickname.slice(0, 1)}</div>
      <div className="stack grow" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontWeight: 800 }}>{m.nickname}</span>
          <span className="sub">{m.full_name}</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {m.status === 'retired' ? <span className="chip">引退</span> : <span className="chip">{gradeOf(m.join_year)}年</span>}
          <span className="chip">{MAJOR_LABELS[m.major]}・{POSITION_LABELS[m.position] === 'リーダー' ? 'L' : 'P'}</span>
          {partnerName && <span className="chip soft">ペア：{partnerName}</span>}
          {sortedRoles.map((r) => <span key={r} className="chip primary">{ROLE_LABELS[r]}</span>)}
        </div>
      </div>
    </div>
  )
}

// 管理者だけが開ける：役職・入部年度・引退の切り替え
function MemberSheet({ m, roles, onClose, onSaved }) {
  const [selRoles, setSelRoles] = useState(roles)
  const [joinYear, setJoinYear] = useState(m.join_year)
  const [status, setStatus] = useState(m.status)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fy = currentFiscalYear()
  const years = Array.from({ length: 8 }, (_, i) => fy - i)

  async function save() {
    setBusy(true)
    setError('')
    const add = selRoles.filter((r) => !roles.includes(r))
    const del = roles.filter((r) => !selRoles.includes(r))
    try {
      if (add.length) {
        const { error } = await supabase.from('member_roles').insert(add.map((role) => ({ member_id: m.id, role })))
        if (error) throw error
      }
      for (const role of del) {
        const { error } = await supabase.from('member_roles').delete().eq('member_id', m.id).eq('role', role)
        if (error) throw error
      }
      if (joinYear !== m.join_year || status !== m.status) {
        const { error } = await supabase.from('members').update({ join_year: Number(joinYear), status }).eq('id', m.id)
        if (error) throw error
      }
      onSaved()
    } catch (e) {
      setError(e.message || '保存できませんでした')
      setBusy(false)
    }
  }

  const toggle = (r) => setSelRoles((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]))

  return (
    <Sheet title={`${m.nickname}（${m.full_name}）`} onClose={onClose}>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>役職（兼任できます）</span>
        <div className="choice-row">
          {ROLE_ORDER.map((r) => (
            <button key={r} type="button" className="choice" aria-pressed={selRoles.includes(r)} onClick={() => toggle(r)}>{ROLE_LABELS[r]}</button>
          ))}
        </div>
      </fieldset>
      <label className="field"><span>入部年度（学年はここから計算）</span>
        <select className="select" value={joinYear} onChange={(e) => setJoinYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}年度（今 {Math.min(fy - y + 1, 4)}年）</option>)}
        </select>
      </label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>状態</span>
        <div className="choice-row">
          <button type="button" className="choice" aria-pressed={status === 'active'} onClick={() => setStatus('active')}>在籍</button>
          <button type="button" className="choice" aria-pressed={status === 'retired'} onClick={() => setStatus('retired')}>引退（ログイン停止）</button>
        </div>
      </fieldset>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存する'}</button>
    </Sheet>
  )
}
