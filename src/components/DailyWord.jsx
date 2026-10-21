import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../lib/session'

const KEY = 'butoken.dailyWord'

// アプリを開くたびに、ひとことをランダムで1つ出す。
// 同じ起動中（タブを行き来している間）は同じものを出し、開き直すと変わる
export default function DailyWord() {
  const { isOfficer } = useSession()
  const [quote, setQuote] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      let savedId = null
      try { savedId = sessionStorage.getItem(KEY) } catch { /* 使えなくても続行 */ }
      const { data } = await supabase.from('quotes').select('id, body, signature').eq('active', true)
      if (!alive || !data?.length) return
      let pick = savedId && data.find((q) => q.id === savedId)
      if (!pick) {
        pick = data[Math.floor(Math.random() * data.length)]
        try { sessionStorage.setItem(KEY, pick.id) } catch { /* noop */ }
      }
      setQuote(pick)
    })()
    return () => { alive = false }
  }, [])

  if (!quote) return null
  return (
    <div className="card daily-word">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <span className="daily-label grow">きょうのひとこと</span>
        {isOfficer && <Link to="/quotes" className="sub" style={{ fontWeight: 700 }}>編集</Link>}
      </div>
      <p className="daily-body">{quote.body}</p>
      {quote.signature && <span className="daily-sign">— {quote.signature}</span>}
    </div>
  )
}
