import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { capsMicros, WATCH_LIST } from '@/lib/ops/admin'
import { diagnose, type CallRow } from '@/lib/ops/diagnose'
import { sendOpsEmail } from '@/lib/ops/notify'
import { SITE_URL } from '@/lib/site'

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/cron/digest: Vercel Cron, every morning (vercel.json). One email
// with yesterday's numbers and anything that needs a look, so /admin only
// has to be opened when something in here says so. Vercel sends
// `Authorization: Bearer $CRON_SECRET`; anything else is refused.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })

  const { data, error } = await db.rpc('admin_dashboard', { p_days: 8, p_env: 'production', p_caps: capsMicros() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { subject, html } = render(data)
  const sent = await sendOpsEmail(subject, html)
  return NextResponse.json({ sent, subject })
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function render(d: any): { subject: string; html: string } {
  // Dollars, as Anthropic bills them.
  const usd = (micros: number) => {
    const v = (micros ?? 0) / 1e6
    return v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`
  }
  const daily: any[] = d.daily ?? []
  // The last row is today (partial, since this runs in the morning).
  const past = daily.slice(0, -1)
  const y = past.at(-1) ?? { signups: 0, active: 0, ai_cost: 0, subscribed: 0, canceled: 0 }
  const week = past.slice(-7)
  const avgCost = week.reduce((a, r) => a + Number(r.ai_cost), 0) / Math.max(week.length, 1)
  const dayName = y.day ? new Date(y.day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'yesterday'

  const ops = d.ops ?? {}
  const bc = d.billing_counts ?? {}
  const fair: any[] = d.fair_use ?? []
  const atHard = fair.reduce((a, f) => a + f.at_hard, 0)
  const alerts: string[] = []
  if (ops.webhook_error) alerts.push(`${ops.webhook_error} Stripe webhook failure(s) this week: someone may have paid and still be locked.`)
  if (ops.ai_error) alerts.push(`${ops.ai_error} Claude API error(s) this week.`)
  if (bc.payment_failed) alerts.push(`${bc.payment_failed} failed payment(s) this week.`)
  if (atHard) alerts.push(`${atHard} person(s) at the hard fair-use cap.`)
  if (avgCost > 0 && Number(y.ai_cost) > 2 * avgCost) alerts.push(`AI spend yesterday was ${(Number(y.ai_cost) / avgCost).toFixed(1)}× the weekly average.`)
  for (const w of WATCH_LIST) {
    const daysLeft = Math.ceil((new Date(w.date).getTime() - Date.now()) / 864e5)
    if (daysLeft <= 30) alerts.push(`${w.date} (${daysLeft} days): ${w.text}`)
  }

  const routes: any[] = d.routes ?? []
  const norms = Object.fromEntries(routes.map((r) => [r.route, r]))
  const outliers: CallRow[] = (d.outliers ?? []).slice(0, 3)

  const cell = 'padding:6px 10px;border-bottom:1px solid #eee;font-size:13px'
  const maxCost = Math.max(...week.map((r) => Number(r.ai_cost)), 1)
  const bars = week
    .map((r) => {
      const h = Math.max(2, Math.round((Number(r.ai_cost) / maxCost) * 60))
      return `<td style="vertical-align:bottom;padding:0 2px;text-align:center"><div style="height:${h}px;width:22px;background:#2a78d6;border-radius:3px 3px 0 0;margin:0 auto" title="${usd(Number(r.ai_cost))}"></div><div style="font-size:10px;color:#888">${esc(String(r.day).slice(8))}</div></td>`
    })
    .join('')

  const tile = (label: string, value: string, sub = '') =>
    `<td style="padding:10px;border:1px solid #eee;border-radius:8px;width:25%"><div style="font-size:11px;color:#888;text-transform:uppercase">${label}</div><div style="font-size:22px;font-weight:600">${value}</div><div style="font-size:11px;color:#666">${sub}</div></td>`

  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;max-width:640px">
<h2 style="margin:0 0 4px">Companheiro · ${esc(dayName)}</h2>
<p style="margin:0 0 16px;color:#666;font-size:13px"><a href="${SITE_URL}/admin">Open the dashboard</a></p>
${alerts.length ? `<div style="background:#fff4e5;border-left:4px solid #fab219;padding:10px 14px;margin-bottom:16px;font-size:13px">${alerts.map((a) => `<div>⚠ ${esc(a)}</div>`).join('')}</div>` : `<div style="background:#eef8ee;border-left:4px solid #0ca30c;padding:10px 14px;margin-bottom:16px;font-size:13px">✓ Nothing needs attention.</div>`}
<table style="width:100%;border-collapse:separate;border-spacing:6px"><tr>
${tile('Signups', String(y.signups))}${tile('Active', String(y.active), 'people')}${tile('AI cost', usd(Number(y.ai_cost)), `7-day avg ${usd(avgCost)}`)}${tile('Subs', `+${y.subscribed} / −${y.canceled}`, `${d.trials_ending_7d} trials end this week`)}
</tr></table>
<p style="font-size:13px;margin:18px 0 6px;font-weight:600">AI cost, last 7 days</p>
<table style="border-collapse:collapse"><tr>${bars}</tr></table>
${routes.length ? `<p style="font-size:13px;margin:18px 0 6px;font-weight:600">Costliest tasks this week</p><table style="border-collapse:collapse;width:100%">${routes.slice(0, 5).map((r) => `<tr><td style="${cell};font-family:monospace">${esc(r.route)}</td><td style="${cell};text-align:right">${r.calls} calls</td><td style="${cell};text-align:right">${usd(Number(r.cost))}</td><td style="${cell};text-align:right;color:#888">typical ${usd(r.p50)}</td></tr>`).join('')}</table>` : ''}
${outliers.length ? `<p style="font-size:13px;margin:18px 0 6px;font-weight:600">Unusual calls</p>${outliers.map((c) => { const f = diagnose(c, norms[c.route!])[0]; return `<div style="font-size:13px;padding:8px 0;border-bottom:1px solid #eee"><b style="font-family:monospace">${esc(c.route)}</b> · ${usd(c.cost)} (${esc(c.ratio)}× median)<br><span style="color:#555">${esc(f.text)}</span>${f.tweak ? `<br><span style="color:#888;font-size:12px">→ ${esc(f.tweak)}</span>` : ''}</div>` }).join('')}` : ''}
${(d.sources ?? []).length ? `<p style="font-size:13px;margin:18px 0 6px;font-weight:600">Sources this week</p><table style="border-collapse:collapse;width:100%">${(d.sources as any[]).slice(0, 6).map((s) => `<tr><td style="${cell}">${esc(s.source)}</td><td style="${cell};text-align:right">${s.signups} signups</td><td style="${cell};text-align:right">${s.started} started</td><td style="${cell};text-align:right">${s.subscribed} subscribed</td></tr>`).join('')}</table>` : ''}
${(d.heard_from ?? []).length ? `<p style="font-size:13px;margin:18px 0 6px;font-weight:600">In their words</p>${(d.heard_from as any[]).slice(0, 5).map((h) => `<div style="font-size:13px;color:#444">“${esc(h.text)}”</div>`).join('')}` : ''}
${(d.billing_recent ?? []).filter((b: any) => b.detail?.feedback || b.detail?.comment).slice(0, 3).map((b: any) => `<div style="font-size:13px;color:#444;margin-top:6px">${esc(b.kind.replace(/_/g, ' '))}: ${esc(b.detail.feedback ?? '')} ${b.detail.comment ? `“${esc(b.detail.comment)}”` : ''}</div>`).join('')}
</div>`

  const subject = `Companheiro · ${dayName}: ${y.signups} signup${y.signups === 1 ? '' : 's'}, ${usd(Number(y.ai_cost))} AI${y.subscribed ? `, +${y.subscribed} sub` : ''}${alerts.length ? ` · ⚠ ${alerts.length}` : ''}`
  return { subject, html }
}
