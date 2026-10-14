import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { EVENT_KIND_LABELS, targetLabel } from '../lib/constants'
import { WEEKDAYS, addDays, fmtDate, fmtTime, fromInputs, sameDay, startOfWeek, toDateInput, toTimeInput } from '../lib/dates'
import { ChevronLeft, ChevronRight, PlusIcon } from '../components/Icons'
import Sheet from '../components/Sheet'
import GradePicker from '../components/GradePicker'

export default function Schedule() {
  const { canEditSchedule } = useSession()
  const today = new Date()
  const [weekStart, setWeekStart] = useState(startOfWeek(today))
  const [selected, setSelected] = useState(today)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null=閉じる, {}=新規, event=編集

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('events')
      .select('*')
      .gte('starts_at', weekStart.toISOString())
      .lt('starts_at', addDays(weekStart, 7).toISOString())
      .order('starts_at')
    setEvents(data ?? [])
    setLoading(false)
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const dayEvents = events.filter((e) => sameDay(new Date(e.starts_at), selected))

  function moveWeek(n) {
    const next = addDays(weekStart, 7 * n)
    setWeekStart(next)
    setSelected(next)
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">予定</h1>
        <div className="row">
          <button className="icon-btn" style={{ background: '#fff' }} aria-label="前の週" onClick={() => moveWeek(-1)}><ChevronLeft /></button>
          <span style={{ fontWeight: 800, minWidth: 64, textAlign: 'center' }}>{weekStart.getMonth() + 1}月</span>
          <button className="icon-btn" style={{ background: '#fff' }} aria-label="次の週" onClick={() => moveWeek(1)}><ChevronRight /></button>
        </div>
      </div>

      <div className="week">
        {days.map((d) => {
          const has = events.some((e) => sameDay(new Date(e.starts_at), d))
          return (
            <button key={d.toISOString()} type="button"
              className={`day${has ? ' has' : ''}${sameDay(d, today) ? ' today' : ''}`}
              aria-pressed={sameDay(d, selected)} aria-label={fmtDate(d)} onClick={() => setSelected(d)}>
              <span className="wd">{WEEKDAYS[d.getDay()]}</span>
              <span className="n">{d.getDate()}</span>
              <span className="dot" />
            </button>
          )
        })}
      </div>

      <h2 className="section-title">{fmtDate(selected)}</h2>
      {loading ? (
        <p className="empty">読み込み中…</p>
      ) : dayEvents.length === 0 ? (
        <div className="card empty">この日の予定はありません</div>
      ) : (
        <div className="stack">
          {dayEvents.map((ev) => (
            <EventCard key={ev.id} ev={ev} onEdit={canEditSchedule ? () => setEditing(ev) : null} />
          ))}
        </div>
      )}

      {canEditSchedule && (
        <button className="btn btn-primary" style={{ alignSelf: 'flex-end', borderRadius: 26 }}
          onClick={() => setEditing({ starts_at: fromInputs(toDateInput(selected), '18:30') })}>
          <PlusIcon /> 予定を追加
        </button>
      )}

      {editing && (
        <EventForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function EventCard({ ev, onEdit }) {
  const target = targetLabel(ev.target_grades)
  const body = (
    <div className={`event kind-${ev.kind}`}>
      <div className="bar" />
      <div className="stack grow" style={{ gap: 4 }}>
        <div className="row" style={{ gap: 6 }}>
          <span className={`chip ${ev.kind === 'event' ? 'orange' : ''}`}>{EVENT_KIND_LABELS[ev.kind]}</span>
          {target && <span className="chip soft">{target}</span>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{ev.title}</div>
        <div className="sub">{fmtTime(ev.starts_at)}–{fmtTime(ev.ends_at)}{ev.location ? `・${ev.location}` : ''}</div>
        {ev.note && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{ev.note}</div>}
      </div>
    </div>
  )
  return onEdit ? (
    <button type="button" className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={onEdit}>{body}</button>
  ) : (
    <div className="card">{body}</div>
  )
}

function EventForm({ initial, onClose, onSaved }) {
  const { member } = useSession()
  const isNew = !initial.id
  const start = new Date(initial.starts_at)
  const end = initial.ends_at ? new Date(initial.ends_at) : new Date(start.getTime() + 150 * 60000)
  const [f, setF] = useState({
    kind: initial.kind ?? 'practice',
    title: initial.title ?? '全体練習',
    date: toDateInput(start),
    start: toTimeInput(start),
    end: toTimeInput(end),
    location: initial.location ?? '',
    note: initial.note ?? '',
    target_grades: initial.target_grades ?? [],
    repeatWeeks: 1
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }))

  async function save(e) {
    e.preventDefault()
    const s = fromInputs(f.date, f.start)
    const en = fromInputs(f.date, f.end)
    if (en <= s) { setError('終了時刻は開始時刻より後にしてください'); return }
    setBusy(true)
    setError('')
    const row = {
      kind: f.kind, title: f.title.trim(), location: f.location.trim() || null, note: f.note.trim() || null,
      target_grades: f.target_grades.length ? f.target_grades : null
    }
    let res
    if (isNew) {
      // 「毎週くり返す」なら同じ曜日・時刻で複数週ぶん作る
      const rows = Array.from({ length: Number(f.repeatWeeks) }, (_, i) => ({
        ...row, created_by: member.id,
        starts_at: addDays(s, 7 * i).toISOString(), ends_at: addDays(en, 7 * i).toISOString()
      }))
      res = await supabase.from('events').insert(rows)
    } else {
      res = await supabase.from('events').update({ ...row, starts_at: s.toISOString(), ends_at: en.toISOString() }).eq('id', initial.id)
    }
    setBusy(false)
    if (res.error) { setError('保存できませんでした。編集の権限があるか確認してください。'); return }
    onSaved()
  }

  async function remove() {
    if (!window.confirm('この予定を削除しますか？')) return
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', initial.id)
    setBusy(false)
    if (error) { setError('削除できませんでした'); return }
    onSaved()
  }

  return (
    <Sheet title={isNew ? '予定を追加' : '予定を編集'} onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <div className="choice-row">
          {Object.entries(EVENT_KIND_LABELS).map(([k, label]) => (
            <button type="button" key={k} className="choice" aria-pressed={f.kind === k} onClick={() => set('kind', k)}>{label}</button>
          ))}
        </div>
        <label className="field"><span>タイトル</span>
          <input className="input" required value={f.title} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label className="field"><span>日付</span>
          <input className="input" type="date" required value={f.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <div className="grid-2">
          <label className="field"><span>開始</span>
            <input className="input" type="time" required value={f.start} onChange={(e) => set('start', e.target.value)} />
          </label>
          <label className="field"><span>終了</span>
            <input className="input" type="time" required value={f.end} onChange={(e) => set('end', e.target.value)} />
          </label>
        </div>
        <label className="field"><span>場所</span>
          <input className="input" value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="第2フロア" />
        </label>
        <GradePicker value={f.target_grades} onChange={(v) => set('target_grades', v)} />
        <label className="field"><span>メモ</span>
          <textarea className="textarea" value={f.note} onChange={(e) => set('note', e.target.value)} />
        </label>
        {isNew && (
          <label className="field"><span>毎週くり返す</span>
            <select className="select" value={f.repeatWeeks} onChange={(e) => set('repeatWeeks', e.target.value)}>
              <option value={1}>くり返さない</option>
              {[4, 8, 12, 15].map((n) => <option key={n} value={n}>{n}週ぶん作る</option>)}
            </select>
          </label>
        )}
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '保存中…' : '保存する'}</button>
        {!isNew && <button type="button" className="btn btn-danger btn-block" disabled={busy} onClick={remove}>削除する</button>}
      </form>
    </Sheet>
  )
}
