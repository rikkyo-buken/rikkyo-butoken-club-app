import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { BoxIcon, CalendarIcon, HomeIcon, TrophyIcon, YenIcon } from './Icons'

const TABS = [
  { to: '/', label: 'ホーム', icon: HomeIcon, end: true },
  { to: '/schedule', label: '予定', icon: CalendarIcon },
  { to: '/money', label: 'お金', icon: YenIcon },
  { to: '/contest', label: '大会', icon: TrophyIcon },
  { to: '/equipment', label: '備品', icon: BoxIcon }
]

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="app">
      {/* 画面が変わるたびに中身を作り直して、出てくる動きを毎回見せる */}
      <div key={pathname}><Outlet /></div>
      <nav className="tabbar" aria-label="メインメニュー">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
