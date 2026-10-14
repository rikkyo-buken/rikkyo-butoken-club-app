import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 接続先が設定されていない（Netlifyの環境変数が入っていない）ときは true
export const configMissing = !url || !anonKey

export const supabase = configMissing
  ? null
  : createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // メールのリンクを「依頼したのと別のブラウザ」で開いてもログインできる方式。
        // （PCで依頼してスマホで開く、など）
        flowType: 'implicit'
      }
    })
