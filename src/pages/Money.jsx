import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'
import { BILL_KIND_LABELS, GRADES, ITEM_STATUS, METHOD_LABELS, gradeOf } from '../lib/constants'
import { downloadCsv, fmtYmd, todayInput, yen } from '../lib/format'
import Segmented from '../components/Segmented'
import Sheet from '../components/Sheet'
import { PlusIcon } from '../components/Icons'

export default function Money() {
  const { hasRole } = useSession()
  const views = [['mine', '自分の支払い']]
  if (hasRole('treasurer')) views.push(['acc', '会計'])
  else if (hasRole('captain', 'vice_captain')) views.push(['sum', '集計'])
  const [view, setView] = useState('mine')

  return (
    <div className="page">
      <h1 className="page-title">お金</h1>
      <Segmented items={views} value={view} onChange={setView} />
      {view === 'mine' && <Mine />}
      {view === 'acc' && <Accounting />}
      {view === 'sum' && <Summary />}
    </div>
  )
}

// ================= 自分の支払い =================
function Mine() {
  const { member } = useSession()
  const [items, setItems] = useState(null)
  const [bank, setBank] = useState('')
  const [reporting, setReporting] = useState(null)

  const load = useCallback(async () => {
    const [{ data }, { data: s }] = await Promise.all([
      supabase.from('bill_items')
        .select('*, bill:bills(title, kind, due_date, note), reports:payment_reports(result, rejected_reason, created_at)')
        .eq('member_id', member.id)
        .order('created_at', { ascending: false }),
      supabase.from('club_settings').select('bank_info').maybeSingle()
    ])
    setItems(data ?? [])
    setBank(s?.bank_info ?? '')
  }, [member.id])
  useEffect(() => { load() }, [load])

  if (!items) return <p className="empty">読み込み中…</p>
  const unpaid = items.filter((i) => i.status === 'unpaid')
  const total = unpaid.reduce((s, i) => s + i.amount, 0)

  return (
    <>
      <div className="card stack" style={{ gap: 6 }}>
        <span className="sub" style={{ fontWeight: 700 }}>未納の合計</span>
        <span className="big-num">{yen(total)}</span>
        {unpaid.length > 0 && <span className="chip red" style={{ alignSelf: 'flex-start' }}>未納 {unpaid.length}件</span>}
      </div>

      {bank && (
        <div className="card tint-sky stack" style={{ gap: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>振込先</span>
          <span style={{ whiteSpace: 'pre-wrap', fontWeight: 700 }}>{bank}</span>
        </div>
      )}

      {items.length === 0 && <div className="card empty">請求はまだありません</div>}
      {items.map((i) => {
        const latest = [...(i.reports ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        const rejected = i.status === 'unpaid' && latest?.result === 'rejected'
        return (
          <div key={i.id} className="card stack" style={{ gap: 8 }}>
            <div className="row">
              <div className="stack grow" style={{ gap: 2 }}>
                <span style={{ fontWeight: 800 }}>{i.bill.title}</span>
                <span className="sub">{BILL_KIND_LABELS[i.bill.kind]}{i.bill.due_date ? `・締切 ${fmtYmd(i.bill.due_date)}` : ''}</span>
              </div>
              <span style={{ fontSize: 18, fontWeight: 800 }}>{yen(i.amount)}</span>
            </div>
            {rejected && <div className="notice error">差し戻されました：{latest.rejected_reason}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              {i.status === 'unpaid'
                ? <button className="btn btn-primary btn-small" onClick={() => setReporting(i)}>払ったので報告する</button>
                : <span className={`chip ${ITEM_STATUS[i.status].chip}`}>{ITEM_STATUS[i.status].label}</span>}
            </div>
          </div>
        )
      })}

      {reporting && <ReportSheet item={reporting} onClose={() => setReporting(null)} onSaved={() => { setReporting(null); load() }} />}
    </>
  )
}

function ReportSheet({ item, onClose, onSaved }) {
  const [method, setMethod] = useState('transfer')
  const [paidOn, setPaidOn] = useState(todayInput())
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.from('payment_reports').insert({ bill_item_id: item.id, method, paid_on: paidOn, memo: memo.trim() || null })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Sheet title="支払いを報告" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <div className="card row">
          <span className="grow" style={{ fontWeight: 800 }}>{item.bill.title}</span>
          <span style={{ fontWeight: 800 }}>{yen(item.amount)}</span>
        </div>
        <div className="choice-row">
          {Object.entries(METHOD_LABELS).map(([k, l]) => (
            <button key={k} type="button" className="choice" aria-pressed={method === k} onClick={() => setMethod(k)}>{l}</button>
          ))}
        </div>
        <label className="field"><span>支払った日</span>
          <input className="input" type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
        </label>
        <label className="field"><span>メモ（振込名義が違う場合など）</span>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </label>
        <p className="sub" style={{ margin: 0 }}>財務が入金を確認すると「支払い済み」になります。</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '送信中…' : '報告する'}</button>
      </form>
    </Sheet>
  )
}

// ================= 会計（財務） =================
function Accounting() {
  const [reports, setReports] = useState([])
  const [bills, setBills] = useState([])
  const [bank, setBank] = useState('')
  const [rejecting, setRejecting] = useState(null)
  const [creating, setCreating] = useState(false)
  const [opened, setOpened] = useState(null)
  const [editingBank, setEditingBank] = useState(false)

  const load = useCallback(async () => {
    const [{ data: r }, { data: b }, { data: s }] = await Promise.all([
      supabase.from('payment_reports')
        .select('*, item:bill_items(amount, member:members(nickname, full_name), bill:bills(title))')
        .eq('result', 'pending').order('created_at'),
      supabase.from('bills').select('*, items:bill_items(amount, status)').order('created_at', { ascending: false }),
      supabase.from('club_settings').select('bank_info').maybeSingle()
    ])
    setReports(r ?? [])
    setBills(b ?? [])
    setBank(s?.bank_info ?? '')
  }, [])
  useEffect(() => { load() }, [load])

  async function approve(rep) {
    await supabase.from('payment_reports').update({ result: 'approved' }).eq('id', rep.id)
    load()
  }

  return (
    <>
      <h2 className="section-title">確認待ちの報告（{reports.length}件）</h2>
      {reports.length === 0 && <div className="card empty">確認待ちはありません</div>}
      {reports.map((r) => (
        <div key={r.id} className="card stack" style={{ gap: 8 }}>
          <div className="row">
            <div className="stack grow" style={{ gap: 2 }}>
              <span style={{ fontWeight: 800 }}>{r.item.member.nickname}<span className="sub">（{r.item.member.full_name}）</span></span>
              <span className="sub">{r.item.bill.title}・{METHOD_LABELS[r.method]}・{fmtYmd(r.paid_on)}</span>
              {r.memo && <span className="sub">メモ：{r.memo}</span>}
            </div>
            <span style={{ fontWeight: 800 }}>{yen(r.item.amount)}</span>
          </div>
          <div className="grid-2">
            <button className="btn btn-small btn-danger" onClick={() => setRejecting(r)}>差し戻す</button>
            <button className="btn btn-small btn-primary" onClick={() => approve(r)}>入金を確認</button>
          </div>
        </div>
      ))}

      <div className="row">
        <h2 className="section-title grow">請求</h2>
        <button className="btn btn-small btn-primary" onClick={() => setCreating(true)}><PlusIcon /> 新しい請求</button>
      </div>
      {bills.length === 0 && <div className="card empty">請求はまだありません</div>}
      {bills.map((b) => {
        const counted = b.items.filter((i) => i.status !== 'waived')
        const paid = counted.filter((i) => i.status === 'paid')
        const rate = counted.length ? Math.round((paid.length / counted.length) * 100) : 0
        return (
          <button key={b.id} type="button" className="card stack" style={{ gap: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpened(b)}>
            <div className="row">
              <span className="grow" style={{ fontWeight: 800 }}>{b.title}</span>
              <span className="chip">{BILL_KIND_LABELS[b.kind]}</span>
            </div>
            <div className="progress"><span style={{ width: `${rate}%` }} /></div>
            <span className="sub">
              {paid.length}/{counted.length}人 支払い済み・{yen(paid.reduce((s, i) => s + i.amount, 0))} / {yen(counted.reduce((s, i) => s + i.amount, 0))}
              {b.due_date ? `・締切 ${fmtYmd(b.due_date)}` : ''}
            </span>
          </button>
        )
      })}

      <div className="row">
        <h2 className="section-title grow">振込先</h2>
        <button className="btn btn-small" onClick={() => setEditingBank(true)}>編集</button>
      </div>
      <div className="card" style={{ whiteSpace: 'pre-wrap' }}>{bank || <span className="sub">未登録です。部員のお金の画面に表示されます。</span>}</div>

      {rejecting && <RejectSheet report={rejecting} onClose={() => setRejecting(null)} onSaved={() => { setRejecting(null); load() }} />}
      {creating && <CreateBillSheet onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {opened && <BillSheet bill={opened} onClose={() => { setOpened(null); load() }} />}
      {editingBank && <BankSheet value={bank} onClose={() => setEditingBank(false)} onSaved={() => { setEditingBank(false); load() }} />}
    </>
  )
}

function RejectSheet({ report, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    const { error } = await supabase.from('payment_reports').update({ result: 'rejected', rejected_reason: reason.trim() }).eq('id', report.id)
    if (error) { setError(error.message); return }
    onSaved()
  }
  return (
    <Sheet title="報告を差し戻す" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <p style={{ margin: 0 }}>{report.item.member.nickname} さんの「{report.item.bill.title}」を未納に戻します。理由は本人に表示されます。</p>
        <label className="field"><span>理由</span>
          <textarea className="textarea" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="入金が確認できませんでした。振込名義を教えてください。" />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-danger btn-block">差し戻す</button>
      </form>
    </Sheet>
  )
}

function CreateBillSheet({ onClose, onSaved }) {
  const [kind, setKind] = useState('dues')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(todayInput(14))
  const [note, setNote] = useState('')
  const [amounts, setAmounts] = useState({ 1: '', 2: '', 3: '', 4: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(e) {
    e.preventDefault()
    const p = {}
    for (const g of GRADES) if (String(amounts[g]).trim() !== '') p[g] = Number(amounts[g])
    if (Object.keys(p).length === 0) { setError('どれかの学年に金額を入れてください'); return }
    setBusy(true)
    const { error } = await supabase.rpc('create_bill', { p_kind: kind, p_title: title.trim(), p_due_date: due || null, p_note: note, p_amounts: p })
    setBusy(false)
    if (error) { setError(error.message); return }
    onSaved()
  }

  return (
    <Sheet title="新しい請求" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <div className="choice-row">
          {['dues', 'camp_event'].map((k) => (
            <button key={k} type="button" className="choice" aria-pressed={kind === k} onClick={() => setKind(k)}>{BILL_KIND_LABELS[k]}</button>
          ))}
        </div>
        <label className="field"><span>タイトル</span>
          <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="後期部費、秋合宿費 など" />
        </label>
        <label className="field"><span>締切</span>
          <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="field">
          <span>学年ごとの金額（空欄の学年には請求しない）</span>
          <div className="amount-grid">
            {GRADES.map((g) => (
              <label key={g} className="row" style={{ gap: 8 }}>
                <span className="nowrap" style={{ fontWeight: 800, width: 36, flexShrink: 0 }}>{g}年</span>
                <input className="input" inputMode="numeric" value={amounts[g]} placeholder="円"
                  onChange={(e) => setAmounts((a) => ({ ...a, [g]: e.target.value.replace(/\D/g, '') }))} />
              </label>
            ))}
          </div>
        </div>
        <label className="field"><span>メモ</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="sub" style={{ margin: 0 }}>作成後に、一人ずつ金額の変更や免除ができます。大会のエントリー費は、大会の確定時に自動で作られます。</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? '作成中…' : '請求を作る'}</button>
      </form>
    </Sheet>
  )
}

// 請求の中身：一人ずつの状態と、金額変更・免除・現金受領
function BillSheet({ bill, onClose }) {
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [amount, setAmount] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('bill_items')
      .select('*, member:members(nickname, full_name, join_year)')
      .eq('bill_id', bill.id)
    setItems((data ?? []).sort((a, b) => a.member.join_year - b.member.join_year || a.member.nickname.localeCompare(b.member.nickname, 'ja')))
  }, [bill.id])
  useEffect(() => { load() }, [load])

  async function update(item, patch) {
    await supabase.from('bill_items').update(patch).eq('id', item.id)
    setEditing(null)
    load()
  }

  function exportCsv() {
    downloadCsv(`${bill.title}.csv`, [
      ['請求', '氏名', 'ニックネーム', '学年', '金額', '状態'],
      ...items.map((i) => [bill.title, i.member.full_name, i.member.nickname, gradeOf(i.member.join_year), i.amount, ITEM_STATUS[i.status].label])
    ])
  }

  return (
    <Sheet title={bill.title} onClose={onClose}>
      <button className="btn btn-small" onClick={exportCsv}>CSVで書き出す</button>
      <div className="card" style={{ padding: '6px 16px' }}>
        {items.map((i) => (
          <div key={i.id} className="list-row">
            <div className="stack grow" style={{ gap: 2 }}>
              <span style={{ fontWeight: 800 }}>{i.member.nickname}<span className="sub">（{gradeOf(i.member.join_year)}年）</span></span>
              <span className={`chip ${ITEM_STATUS[i.status].chip}`} style={{ alignSelf: 'flex-start' }}>{ITEM_STATUS[i.status].label}</span>
            </div>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => { setEditing(i); setAmount(String(i.amount)) }}>{yen(i.amount)}</button>
          </div>
        ))}
      </div>
      {editing && (
        <div className="card stack" style={{ gap: 10 }}>
          <span style={{ fontWeight: 800 }}>{editing.member.nickname} さん</span>
          <div className="row">
            <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
            <button className="btn btn-small btn-primary" onClick={() => update(editing, { amount: Number(amount || 0) })}>金額を変更</button>
          </div>
          <div className="choice-row">
            {editing.status !== 'paid' && <button className="btn btn-small" onClick={() => update(editing, { status: 'paid' })}>受け取り済みにする</button>}
            {editing.status !== 'waived' && <button className="btn btn-small" onClick={() => update(editing, { status: 'waived' })}>免除する</button>}
            {editing.status !== 'unpaid' && <button className="btn btn-small btn-danger" onClick={() => update(editing, { status: 'unpaid' })}>未納に戻す</button>}
          </div>
        </div>
      )}
    </Sheet>
  )
}

function BankSheet({ value, onClose, onSaved }) {
  const [text, setText] = useState(value)
  async function save(e) {
    e.preventDefault()
    await supabase.from('club_settings').update({ bank_info: text.trim() || null }).eq('id', 1)
    onSaved()
  }
  return (
    <Sheet title="振込先" onClose={onClose}>
      <form className="stack" style={{ gap: 14 }} onSubmit={save}>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)}
          placeholder={'〇〇銀行 池袋支店\n普通 1234567\nリッキョウブトウケンキュウカイ'} />
        <p className="sub" style={{ margin: 0 }}>在籍部員のお金の画面に表示されます。</p>
        <button className="btn btn-primary btn-block">保存する</button>
      </form>
    </Sheet>
  )
}

// ================= 集計（主将・副将） =================
function Summary() {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    supabase.rpc('bill_summaries').then(({ data }) => setRows(data ?? []))
  }, [])
  if (!rows) return <p className="empty">読み込み中…</p>
  if (rows.length === 0) return <div className="card empty">請求はまだありません</div>
  return rows.map((r) => {
    const counted = r.total_count - 0
    const rate = counted ? Math.round((r.paid_count / counted) * 100) : 0
    return (
      <div key={r.bill_id} className="card stack" style={{ gap: 8 }}>
        <span style={{ fontWeight: 800 }}>{r.title}</span>
        <div className="progress"><span style={{ width: `${rate}%` }} /></div>
        <span className="sub">支払い済み {r.paid_count}人・確認待ち {r.pending_count}人・未納 {r.unpaid_count}人</span>
        <span className="sub">{yen(r.paid_amount)} / {yen(r.total_amount)}{r.due_date ? `・締切 ${fmtYmd(r.due_date)}` : ''}</span>
      </div>
    )
  })
}
