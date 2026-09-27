// Email to the owner, through Resend's REST API (no SDK). Used for the daily
// digest and for the few failures that can't wait until morning. Silent
// no-op when RESEND_API_KEY or OPS_EMAIL is missing.
import { adminClient } from '@/lib/supabase/admin'
import { recordOpsEvent } from './ai-calls'

export async function sendOpsEmail(subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim()
  const to = process.env.OPS_EMAIL?.trim()
  if (!key || !to) return false
  const from = process.env.OPS_EMAIL_FROM?.trim() || 'Companheiro <ops@companheiro.app>'
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: to.split(',').map((x) => x.trim()), subject, html }),
    })
    if (!res.ok) console.error('sendOpsEmail failed:', res.status, await res.text().catch(() => ''))
    return res.ok
  } catch (e) {
    console.error('sendOpsEmail failed:', e)
    return false
  }
}

// Immediate alert, at most once an hour per key, so a failing webhook that
// Stripe retries twenty times sends one email, not twenty.
export async function alertNow(key: string, subject: string, body: string): Promise<void> {
  try {
    const db = adminClient()
    if (db) {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { count } = await db
        .from('ops_events')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'alert_sent')
        .eq('route', key)
        .gte('created_at', since)
      if ((count ?? 0) > 0) return
    }
    const ok = await sendOpsEmail(`⚠ ${subject}`, `<p style="font-family:sans-serif">${body}</p>`)
    if (ok) await recordOpsEvent('alert_sent', key, subject)
  } catch (e) {
    console.error('alertNow failed:', e)
  }
}
