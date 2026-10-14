import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './lib/session'
import Layout from './components/Layout'
import Login from './pages/Login'
import Join, { ProfileForm, getStoredInvite } from './pages/Join'
import { NoInvite, Retired } from './pages/Blocked'
import Home from './pages/Home'
import Schedule from './pages/Schedule'
import Members from './pages/Members'
import Profile from './pages/Profile'
import Invites from './pages/admin/Invites'
import GradeSettings from './pages/admin/GradeSettings'
import ComingSoon from './pages/ComingSoon'

export default function App() {
  const { loading } = useSession()

  if (loading) {
    return <div className="center-screen"><p className="sub" style={{ textAlign: 'center' }}>読み込み中…</p></div>
  }

  return (
    <Routes>
      <Route path="/join/:token" element={<Join />} />
      <Route path="*" element={<Gate />} />
    </Routes>
  )
}

// ログイン状態に応じて、使える画面を切り替える
function Gate() {
  const { session, member, isAdmin } = useSession()

  if (!session) return <Login />
  if (!member) {
    const token = getStoredInvite()
    return token ? <ProfileForm token={token} /> : <NoInvite />
  }
  if (member.status !== 'active') return <Retired />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="money" element={<ComingSoon title="お金" />} />
        <Route path="contest" element={<ComingSoon title="大会" />} />
        <Route path="equipment" element={<ComingSoon title="備品" />} />
        <Route path="members" element={<Members />} />
        <Route path="me" element={<Profile />} />
        {isAdmin && <Route path="admin/invites" element={<Invites />} />}
        {isAdmin && <Route path="admin/grades" element={<GradeSettings />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
