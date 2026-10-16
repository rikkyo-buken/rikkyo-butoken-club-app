import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { MAJOR_LABELS, POSITION_LABELS, ROLE_LABELS, ROLE_ORDER } from '../lib/constants'
import { ChevronLeft } from '../components/Icons'

export default function Profile() {
  const { member, roles, grade, session, reload } = useSession()
  const [f, setF] = useState({ full_name: member.full_name, nickname: member.nickname, major: member.major, position: member.position })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('members')
      .update({ full_name: f.full_name.trim(), nickname: f.nickname.trim(), major: f.major, position: f.position })
      .eq('id', member.id)
    setBusy(false)
    setMsg(error ? { type: 'error', text: '保存できませんでした' } : { type: 'ok', text: '保存しました' })
    if (!error) reload()
  }

  return (
    <form className="page" onSubmit={save}>
      <div className="page-header">
        <div className="row">
          <Link to="/" className="icon-btn" style={{ background: 'transparent', boxShadow: 'none', border: 0, color: 'var(--ink)' }} aria-label="ホームへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">プロフィール</h1>
        </div>
      </div>

      <div className="card stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          <span className="chip">{grade}年（{member.join_year}年度入部）</span>
          {ROLE_ORDER.filter((r) => roles.includes(r)).map((r) => <span key={r} className="chip primary">{ROLE_LABELS[r]}</span>)}
        </div>
        <span className="sub">{session.user.email}</span>
        <span className="sub">入部年度と役職は管理者が変更します。</span>
      </div>

      <PartnerCard />

      <label className="field"><span>氏名</span>
        <input className="input" required value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
      </label>
      <label className="field"><span>ニックネーム</span>
        <input className="input" required value={f.nickname} onChange={(e) => set('nickname', e.target.value)} />
      </label>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>専攻</span>
        <div className="choice-row">
          {Object.entries(MAJOR_LABELS).map(([k, l]) => (
            <button type="button" key={k} className="choice" aria-pressed={f.major === k} onClick={() => set('major', k)}>{l}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <span>リーダー / パートナー</span>
        <div className="choice-row">
          {Object.entries(POSITION_LABELS).map(([k, l]) => (
            <button type="button" key={k} className="choice" aria-pressed={f.position === k} onClick={() => set('position', k)}>{l}</button>
          ))}
        </div>
      </fieldset>

      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
      <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '保存中…' : '保存する'}</button>
      <button type="button" className="btn btn-block" onClick={() => supabase.auth.signOut()}>ログアウト</button>
    </form>
  )
}

// ペア（カップル）の設定。設定すると相手側にも自動で反映される
function PartnerCard() {
  const { member, reload } = useSession()
  const [members, setMembers] = useState([])
  const [pick, setPick] = useState(member.partner_id ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    supabase.from('members').select('id, nickname, full_name, position, partner_id').eq('status', 'active').order('nickname')
      .then(({ data }) => setMembers((data ?? []).filter((m) => m.id !== member.id)))
  }, [member.id])

  const current = members.find((m) => m.id === member.partner_id)

  async function save(value) {
    setBusy(true)
    const { error } = await supabase.rpc('set_partner', { p_partner: value || null })
    setBusy(false)
    if (error) { setMsg({ type: 'error', text: error.message }); return }
    setMsg({ type: 'ok', text: value ? 'ペアを設定しました。相手のプロフィールにも反映されます。' : 'ペアを解除しました。' })
    reload()
  }

  return (
    <div className="card tint-pink stack" style={{ gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 800 }}>ペア（カップルの相手）</span>
      <span style={{ fontSize: 18, fontWeight: 800 }}>{current ? `${current.nickname}（${current.full_name}）` : 'まだ設定していません'}</span>
      <span className="sub" style={{ color: 'var(--ink)' }}>大会にエントリーすると、ペアの相手も自動でエントリーされます。</span>
      <div className="row">
        <select className="select grow" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="ペアの相手">
          <option value="">選んでください</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nickname}（{m.full_name}・{POSITION_LABELS[m.position]}）{m.partner_id && m.partner_id !== member.id ? '・別のペアあり' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-small btn-primary nowrap" disabled={busy || !pick || pick === member.partner_id} onClick={() => save(pick)}>設定</button>
      </div>
      {current && <button type="button" className="btn btn-small btn-ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => { setPick(''); save(null) }}>ペアを解除する</button>}
      {msg && <div className={`notice ${msg.type}`}>{msg.text}</div>}
    </div>
  )
}
