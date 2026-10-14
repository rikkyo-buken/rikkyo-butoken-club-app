import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { gradeOf } from './constants'

// ログイン状態・自分の部員情報・役職・学年別権限を、アプリ全体で共有する
const SessionContext = createContext(null)

export function SessionProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = 読み込み中
  const [member, setMember] = useState(null)
  const [roles, setRoles] = useState([])
  const [gradePerms, setGradePerms] = useState([])
  const [loadingMember, setLoadingMember] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reload = useCallback(async () => {
    if (!session) {
      setMember(null)
      setRoles([])
      setLoadingMember(false)
      return
    }
    setLoadingMember(true)
    // 自分の行は引退後でも読める（引退画面を出すため）
    const { data: me } = await supabase
      .from('members')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()
    setMember(me ?? null)
    if (me && me.status === 'active') {
      const [{ data: r }, { data: gp }] = await Promise.all([
        supabase.from('member_roles').select('role').eq('member_id', me.id),
        supabase.from('grade_permissions').select('*')
      ])
      setRoles((r ?? []).map((x) => x.role))
      setGradePerms(gp ?? [])
    } else {
      setRoles([])
      setGradePerms([])
    }
    setLoadingMember(false)
  }, [session])

  useEffect(() => {
    if (session !== undefined) reload()
  }, [session, reload])

  const value = useMemo(() => {
    const grade = member ? gradeOf(member.join_year) : null
    const isAdmin = roles.includes('admin')
    // 画面でボタンを出すかどうかの判定。実際の可否はデータベースが決める
    const hasRole = (...names) => isAdmin || names.some((n) => roles.includes(n))
    const gradeCan = (perm) => gradePerms.some((p) => p.grade === grade && p.permission === perm && p.allowed)
    return {
      session,
      member,
      roles,
      grade,
      gradePerms,
      loading: session === undefined || (session && loadingMember),
      isAdmin,
      isOfficer: roles.length > 0,
      hasRole,
      gradeCan,
      canEditSchedule: hasRole('captain', 'vice_captain') || gradeCan('schedule.edit'),
      reload
    }
  }, [session, member, roles, gradePerms, loadingMember, reload])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}
