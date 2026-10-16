// =============================================================
// 舞研アプリ：プッシュ通知を送る Edge Function（send-push）
//
// notifications に行が追加されると、Database Webhook がこの関数を呼ぶ。
// 届いた行の id を使ってデータベースから通知を読み直し、まだ送っていなければ
// その部員の全端末へプッシュ通知を送る。
//
// 必要なシークレット（Supabase → Edge Functions → Secrets）
//   VAPID_PRIVATE_JWK : プッシュ通知の秘密鍵（JSON文字列）
//   VAPID_CONTACT     : 連絡先（例 mailto:xxx@gmail.com）。省略可
// SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で用意する。
// =============================================================
import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildPushHTTPRequest } from 'npm:@pushforge/builder@2'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const payload = await req.json().catch(() => null)
  const id: string | undefined = payload?.record?.id ?? payload?.id
  if (!id) return json({ error: 'notification id がありません' }, 400)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 「送った」印を先に付ける。すでに付いていれば何もしない（二重送信と、なりすましの呼び出しを防ぐ）
  const { data: n, error } = await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .eq('id', id)
    .is('pushed_at', null)
    .select('id, member_id, title, body, url')
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!n) return json({ skipped: true })

  const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('member_id', n.member_id)
  if (!subs?.length) return json({ sent: 0 })

  const privateJWK = JSON.parse(Deno.env.get('VAPID_PRIVATE_JWK')!)
  const adminContact = Deno.env.get('VAPID_CONTACT') ?? 'mailto:butoken.app@example.com'
  let sent = 0

  for (const s of subs) {
    try {
      const { endpoint, headers, body } = await buildPushHTTPRequest({
        privateJWK,
        subscription: { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        message: {
          payload: { id: n.id, title: n.title, body: n.body ?? '', url: n.url ?? '/notifications' },
          adminContact,
          options: { ttl: 60 * 60 * 24, urgency: 'normal' }
        }
      })
      const res = await fetch(endpoint, { method: 'POST', headers, body })
      if (res.status === 404 || res.status === 410) {
        // 端末側で通知が解除された購読は消す
        await supabase.from('push_subscriptions').delete().eq('id', s.id)
      } else if (res.ok) {
        sent++
      } else {
        console.error('push failed', res.status, await res.text())
      }
    } catch (e) {
      console.error('push error', e)
    }
  }
  return json({ sent })
})
