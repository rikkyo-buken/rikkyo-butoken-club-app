import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください（.env.example を参照）')
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // メールのリンクを「依頼したのと別のブラウザ」で開いてもログインできる方式。
    // （PCで依頼してスマホで開く、など）
    flowType: 'implicit'
  }
})
