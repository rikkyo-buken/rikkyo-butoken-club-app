import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BellIcon } from './Icons'

// ホーム右上のベル。未読があれば数を出す
export default function Bell() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const load = () => supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      .then(({ count }) => setCount(count ?? 0))
    load()
    window.addEventListener('notifications-read', load)
    window.addEventListener('focus', load)
    return () => { window.removeEventListener('notifications-read', load); window.removeEventListener('focus', load) }
  }, [])
  return (
    <Link to="/notifications" className="icon-btn bell" aria-label={count ? `お知らせ（未読${count}件）` : 'お知らせ'}>
      <BellIcon />
      {count > 0 && <span className="badge">{count > 99 ? '99+' : count}</span>}
    </Link>
  )
}
