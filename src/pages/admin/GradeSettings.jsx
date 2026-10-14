import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSession } from '../../lib/session'
import { GRADES, GRADE_PERMISSIONS } from '../../lib/constants'
import { ChevronLeft } from '../../components/Icons'

// 管理者用：学年ごとに「できること」を切り替える
export default function GradeSettings() {
  const { gradePerms, reload } = useSession()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  const allowed = (grade, perm) => gradePerms.some((p) => p.grade === grade && p.permission === perm && p.allowed)

  async function toggle(grade, perm) {
    setBusy(`${grade}:${perm}`)
    setError('')
    const { error } = await supabase.from('grade_permissions')
      .upsert({ grade, permission: perm, allowed: !allowed(grade, perm) })
    setBusy(null)
    if (error) { setError('変更できませんでした'); return }
    reload()
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="row">
          <Link to="/members" className="icon-btn" style={{ background: 'transparent', boxShadow: 'none', border: 0, color: 'var(--ink)' }} aria-label="部員リストへ戻る"><ChevronLeft /></Link>
          <h1 className="page-title">学年別の権限</h1>
        </div>
      </div>
      <p className="sub" style={{ margin: 0 }}>役職による権限とは別に、学年ごとに許可できます。主将・副将・管理者は常に操作できます。</p>

      {GRADE_PERMISSIONS.map(({ key, label }) => (
        <div key={key} className="card stack" style={{ gap: 12 }}>
          <div style={{ fontWeight: 900 }}>{label}</div>
          <div className="choice-row">
            {GRADES.map((g) => (
              <button key={g} type="button" className="choice" aria-pressed={allowed(g, key)}
                disabled={busy === `${g}:${key}`} onClick={() => toggle(g, key)}>
                {g}年{allowed(g, key) ? '：可' : '：不可'}
              </button>
            ))}
          </div>
        </div>
      ))}
      {error && <div className="notice error">{error}</div>}
    </div>
  )
}
