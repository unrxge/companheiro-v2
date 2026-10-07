'use client'

// Owner-only operations page: money in vs out, where people come from, how
// far they get, what each companion task costs and which calls ran
// abnormally, retention, churn and breakage. Everything arrives in one call
// (/api/admin/overview → admin_dashboard() in migration 026); a task's
// drill-down loads its recent calls on demand.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { OpsRoot, Columns, Spark, HBar, StackBar, CostScatter, Status, SERIES, rampColor, useTip } from '@/components/admin/charts'
import { diagnose, variantOf, type CallRow, type RouteNorms } from '@/lib/ops/diagnose'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Data = any

const card = 'rounded-2xl p-4 md:p-5'
const cardStyle = { background: 'var(--ops-surface)', border: '1px solid var(--ops-line)' }
const muted = { color: 'var(--ops-muted)' }
const soft = { color: 'var(--ops-text-2)' }

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hint && <p className="mt-0.5 text-xs" style={muted}>{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Tile({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={card} style={cardStyle}>
      <p className="text-[11px] uppercase tracking-wider" style={muted}>{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-xs" style={soft}>{sub}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—')
const k = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v ?? 0)))

export default function AdminPage() {
  const [days, setDays] = useState(30)
  const [env, setEnv] = useState('production')
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [route, setRoute] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setError(null)
    fetch(`/api/admin/overview?days=${days}&env=${env}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!live) return
        if (!r.ok) setError(r.status === 404 ? 'This page is only for the owner (ADMIN_USER_IDS).' : d.error || 'Failed to load')
        else setData(d)
      })
      .catch((e) => live && setError(String(e)))
    return () => { live = false }
  }, [days, env])

  // AI cost is billed in dollars, so it is shown in dollars, unconverted.
  const usd = useCallback((micros: number) => {
    const v = (micros ?? 0) / 1e6
    if (v === 0) return '$0'
    if (Math.abs(v) >= 100) return `$${v.toFixed(0)}`
    if (Math.abs(v) >= 1) return `$${v.toFixed(2)}`
    if (Math.abs(v) >= 0.01) return `$${v.toFixed(3)}`
    return `$${v.toFixed(4)}`
  }, [])

  return (
    <OpsRoot>
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
            <p className="text-xs" style={muted}>
              {data ? `Updated ${new Date(data.generated_at).toLocaleString()} · AI cost in dollars as billed · revenue is estimated, converted from euros at €${data.money.eurPerUsd} per $1` : 'Loading…'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Toggle value={String(days)} options={['7', '30', '90']} suffix="d" onChange={(v) => setDays(Number(v))} />
            <Toggle value={env} options={['production', 'preview', 'development', 'script']} onChange={setEnv} />
          </div>
        </header>

        {error && <p className="mt-6 text-sm" style={{ color: 'var(--critical)' }}>{error}</p>}
        {data && <Body data={data} usd={usd} days={days} env={env} route={route} setRoute={setRoute} />}
      </div>
    </OpsRoot>
  )
}

function Toggle({ value, options, onChange, suffix = '' }: { value: string; options: string[]; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="inline-flex rounded-full p-0.5" style={{ border: '1px solid var(--ops-line)' }}>
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className="rounded-full px-3 py-1 text-xs"
          style={o === value ? { background: 'var(--ops-text)', color: 'var(--ops-bg)' } : soft}
        >
          {o}{suffix}
        </button>
      ))}
    </div>
  )
}

function Body({ data, usd, days, env, route, setRoute }: { data: Data; usd: (m: number) => string; days: number; env: string; route: string | null; setRoute: (r: string | null) => void }) {
  const m = data.money
  const daily: any[] = data.daily ?? []
  const dayLabels = daily.map((d) => new Date(d.day + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))

  // ── Money ────────────────────────────────────────────────────────────────
  const paying = (data.subs as any[]).filter((s) => s.status === 'active' || s.status === 'past_due')
  const mrrByTier: Record<string, number> = { practice: 0, direction: 0 }
  const payingByTier: Record<string, number> = { practice: 0, direction: 0 }
  for (const s of paying) {
    const tier = s.tier ?? 'practice'
    const p = m.prices[tier] ?? m.prices.practice
    mrrByTier[tier] += s.n * (s.interval === 'yearly' ? p.yearly / 12 : p.monthly)
    payingByTier[tier] += s.n
  }
  const mrr = mrrByTier.practice + mrrByTier.direction
  const net = mrr * m.netFactor
  const aiWindow = daily.reduce((a, d) => a + Number(d.ai_cost), 0)
  const aiMonthly = (aiWindow / Math.max(daily.length, 1)) * 30
  const aiMonthlyUsd = aiMonthly / 1e6
  const mrrUsd = mrr / m.eurPerUsd
  const netUsd = net / m.eurPerUsd
  const count = (status: string) => (data.subs as any[]).filter((s) => s.status === status).reduce((a, s) => a + s.n, 0)
  const cancelling = paying.filter((s) => s.cancel_at_period_end).reduce((a, s) => a + s.n, 0)
  const otherEnv = daily.reduce((a, d) => a + Number(d.other_env_cost), 0)

  // ── Alerts ───────────────────────────────────────────────────────────────
  const ops = data.ops ?? {}
  const fairUse: any[] = data.fair_use ?? []
  const capped = fairUse.reduce((a, f) => a + f.users, 0)
  const overSoft = fairUse.reduce((a, f) => a + f.over_soft, 0)
  const atHard = fairUse.reduce((a, f) => a + f.at_hard, 0)
  const bc = data.billing_counts ?? {}
  const watch = (data.watch as any[]).filter((w) => (new Date(w.date).getTime() - Date.now()) / 864e5 < 45)

  const routes: any[] = useMemo(() => data.routes ?? [], [data])
  // The day whose per-task totals are open; today (the last one) by default.
  const [day, setDay] = useState<number | null>(null)
  const dayIndex = day !== null && day < daily.length ? day : daily.length - 1
  const norms = useMemo(() => Object.fromEntries(routes.map((r) => [r.route, r as RouteNorms])), [routes])

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-2">
        {ops.webhook_error ? <Status level="critical">{ops.webhook_error} Stripe webhook failures</Status> : <Status level="good">Stripe webhook healthy</Status>}
        {ops.ai_error ? <Status level="serious">{ops.ai_error} Claude API errors</Status> : <Status level="good">No Claude API errors</Status>}
        {bc.payment_failed ? <Status level="warning">{bc.payment_failed} failed payments</Status> : null}
        {atHard ? <Status level="serious">{atHard} people at the hard cap</Status> : null}
        {capped > 0 && overSoft / capped > 0.02 ? <Status level="warning">{pct(overSoft, capped)} past soft cap (target &lt;2%)</Status> : null}
        {watch.map((w) => <Status key={w.date} level="warning">{w.date}: {w.text}</Status>)}
      </div>

      <Section title="Money in vs. out" hint="Revenue from current subscriptions at list price; net after VAT and fees is an estimate (REVENUE_NET_FACTOR).">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile label="Monthly revenue (gross)" value={`$${mrrUsd.toFixed(0)}`} sub={`$${netUsd.toFixed(0)} net est. · €${mrr.toFixed(0)} at list price`} />
          <Tile label="AI cost, monthly pace" value={`$${aiMonthlyUsd.toFixed(2)}`} sub={`${usd(aiWindow)} over ${days} days`} />
          <Tile label="Margin, monthly pace" value={`$${(netUsd - aiMonthlyUsd).toFixed(0)}`} sub={netUsd > 0 ? `AI is ${Math.round((aiMonthlyUsd / netUsd) * 100)}% of net` : 'no paying users yet'} />
          <Tile label="People" value={`${payingByTier.practice + payingByTier.direction} paying`} sub={`${payingByTier.practice} Practice · ${payingByTier.direction} Direction · ${count('trialing')} in trial · ${count('grandfathered')} free${cancelling ? ` · ${cancelling} cancelling` : ''}`} />
        </div>
        <div className={`${card} mt-3`} style={cardStyle}>
          <p className="mb-2 text-sm font-medium">AI cost per day <span className="text-xs font-normal" style={muted}>({env})</span></p>
          <Columns values={daily.map((d) => Number(d.ai_cost))} labels={dayLabels} format={usd} highlight={(i) => i === dayIndex} onSelect={setDay} />
          <p className="mt-1 text-xs" style={muted}>Click a day to see what each task cost on it.</p>
          <DayByTask routes={routes} daily={daily} labels={dayLabels} index={dayIndex} usd={usd} onSelect={setDay} />
          {env === 'production' && otherEnv > 0 && (
            <p className="mt-2 text-xs" style={muted}>Plus {usd(otherEnv)} spent from preview/dev deploys and maintenance scripts in the same window. Switch the toggle above to see it.</p>
          )}
        </div>
        <div className={`${card} mt-3`} style={cardStyle}>
          <p className="mb-3 text-sm font-medium">Cost per person, by plan <span className="text-xs font-normal" style={muted}>(window cost ÷ people who used AI; line = net revenue per person over the same window)</span></p>
          <div className="space-y-3">
            {(data.cost_by_plan as any[]).sort((a, b) => b.cost - a.cost).map((p) => {
              const per = p.users ? p.cost / p.users : 0
              const price = m.prices[p.plan]
              const netPerPersonMicros = price ? ((price.monthly * m.netFactor * (days / 30)) / m.eurPerUsd) * 1e6 : undefined
              const max = Math.max(per, netPerPersonMicros ?? 0) * 1.1 || 1
              return (
                <div key={p.plan} className="grid grid-cols-[110px_1fr_140px] items-center gap-3 text-sm">
                  <span>{p.plan}</span>
                  <HBar value={per} max={max} marker={netPerPersonMicros} color={netPerPersonMicros && per > netPerPersonMicros ? 'var(--s2)' : 'var(--s1)'} tip={<>{p.plan}: {usd(per)} per person, {p.users} people, {usd(p.cost)} total</>} />
                  <span className="text-right tabular-nums" style={soft}>{usd(per)} × {p.users}</span>
                </div>
              )
            })}
          </div>
        </div>
      </Section>

      <Section title="Where people come from" hint="From links tagged with utm_source/ref, the referring site, or their own answer at signup.">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={card} style={cardStyle}>
            <p className="mb-2 text-sm font-medium">Signups per day</p>
            <Columns values={daily.map((d) => Number(d.signups))} labels={dayLabels} format={(v) => `${Math.round(v)}`} height={90} />
          </div>
          <div className={card} style={cardStyle}>
            <p className="mb-2 text-sm font-medium">By source <span className="text-xs font-normal" style={muted}>(signups · started a project · subscribed)</span></p>
            <SourceTable sources={data.sources} />
          </div>
        </div>
        {(data.heard_from as any[]).length > 0 && (
          <div className={`${card} mt-3`} style={cardStyle}>
            <p className="mb-2 text-sm font-medium">In their words</p>
            <ul className="space-y-1 text-sm" style={soft}>
              {(data.heard_from as any[]).map((h, i) => (
                <li key={i}>“{h.text}” <span className="text-xs" style={muted}>{new Date(h.at).toLocaleDateString()}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section title="From signup to subscriber" hint={`Everyone who signed up in the last ${days} days.`}>
        <Funnel f={data.funnel} trialsEnding={data.trials_ending_7d} trialsExpired={data.trials_expired_in_window} repeat={data.repeat_trials} blocked={ops.signup_blocked ?? 0} />
      </Section>

      <Section title="AI cost by task" hint="Click a task for every call it made, what each one carried, and why the unusual ones cost what they did.">
        <RouteTable routes={routes} usd={usd} selected={route} onSelect={(r) => setRoute(r === route ? null : r)} />
        {route && <RouteDetail route={route} days={days} env={env} usd={usd} norms={norms[route]} />}
        <div className={`${card} mt-3`} style={cardStyle}>
          <p className="text-sm font-medium">Unusual calls, every task</p>
          <p className="mb-3 text-xs" style={muted}>3× their task’s median and at least $0.005, or cut off at max_tokens. Biggest ratio first.</p>
          {(data.outliers as CallRow[]).length === 0 ? (
            <p className="text-sm" style={muted}>None in this window.</p>
          ) : (
            <div className="space-y-3">
              {(data.outliers as CallRow[]).map((c) => <CallCard key={c.id} call={c} usd={usd} norms={norms[c.route!]} showRoute />)}
            </div>
          )}
        </div>
      </Section>

      <Section title="Fair use and heaviest users" hint="Share of people on each plan past the soft threshold (target under 2%), and this window's ten costliest accounts (ids only).">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className={card} style={cardStyle}>
            {fairUse.length === 0 ? <p className="text-sm" style={muted}>No capped plans in use.</p> : fairUse.map((f) => (
              <div key={f.plan} className="mb-3 grid grid-cols-[90px_1fr_120px] items-center gap-3 text-sm">
                <span>{f.plan}</span>
                <HBar value={f.over_soft} max={Math.max(f.users, 1)} marker={f.users * 0.02} color={f.over_soft / Math.max(f.users, 1) > 0.02 ? 'var(--s2)' : 'var(--s1)'} tip={<>{f.over_soft} of {f.users} past soft; {f.near_hard} near hard; {f.at_hard} at hard</>} />
                <span className="text-right tabular-nums" style={soft}>{f.over_soft}/{f.users} · {f.at_hard} hard</span>
              </div>
            ))}
          </div>
          <div className={card} style={cardStyle}>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider" style={muted}><th className="pb-2">user</th><th>plan</th><th>top task</th><th className="text-right">window</th><th className="w-24 text-right">vs soft cap</th></tr></thead>
              <tbody>
                {(data.top_users as any[]).map((u) => {
                  const cap = m.caps[u.plan]?.soft
                  return (
                    <tr key={u.user} className="border-t" style={{ borderColor: 'var(--ops-line)' }}>
                      <td className="py-1.5 font-mono text-xs">{u.user}</td>
                      <td>{u.plan}</td>
                      <td className="text-xs" style={soft}>{u.top_route}</td>
                      <td className="text-right tabular-nums">{usd(u.cost)}</td>
                      <td className="pl-3">{cap ? <HBar value={u.period_used ?? 0} max={cap * 1e6} color={(u.period_used ?? 0) > cap * 1e6 ? 'var(--s2)' : 'var(--s1)'} tip={<>{usd(u.period_used ?? 0)} this period of a {usd(cap * 1e6)} soft cap</>} /> : <span className="text-xs" style={muted}>uncapped</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="Who stays" hint="Share of each week's signups who were active in each following week (any companion use, writing time or check-in).">
        <Cohorts cohorts={data.cohorts} />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div className={card} style={cardStyle}>
            <p className="mb-2 text-sm font-medium">Subscriptions this window</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              {[['subscribed', bc.subscribed], ['resubscribed', bc.resubscribed], ['tier changed', bc.tier_changed], ['cancel scheduled', bc.cancel_scheduled], ['cancelled', bc.canceled], ['payment failed', bc.payment_failed]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg p-2" style={{ background: 'rgba(236,233,226,0.04)' }}>
                  <p className="text-xl font-semibold tabular-nums">{(v as number) ?? 0}</p>
                  <p className="text-[11px]" style={muted}>{l}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs" style={muted}>Active users per day:</p>
            <Columns values={daily.map((d) => Number(d.active))} labels={dayLabels} format={(v) => `${Math.round(v)} active`} height={60} color="var(--s3)" />
          </div>
          <div className={card} style={cardStyle}>
            <p className="mb-2 text-sm font-medium">Recent billing events</p>
            <ul className="space-y-1.5 text-sm">
              {(data.billing_recent as any[]).length === 0 && <li style={muted}>Nothing yet.</li>}
              {(data.billing_recent as any[]).map((b, i) => (
                <li key={i} className="flex flex-wrap gap-x-2">
                  <span className="text-xs tabular-nums" style={muted}>{new Date(b.at).toLocaleDateString()}</span>
                  <span>{b.kind.replace(/_/g, ' ')}</span>
                  {b.tier && <span style={soft}>{b.tier}{b.interval ? ` / ${b.interval}` : ''}</span>}
                  {(b.detail?.feedback || b.detail?.comment) && (
                    <span className="w-full text-xs" style={soft}>{b.detail.feedback ? `reason: ${String(b.detail.feedback).replace(/_/g, ' ')}` : ''}{b.detail.comment ? ` · “${b.detail.comment}”` : ''}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="What broke" hint="Webhook failures, Claude API errors and refused signups in this window.">
        <div className={card} style={cardStyle}>
          <div className="mb-3 flex flex-wrap gap-2 text-xs" style={soft}>
            {Object.entries(ops).filter(([kk]) => kk !== 'alert_sent').map(([kk, v]) => <span key={kk} className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--ops-line)' }}>{kk.replace(/_/g, ' ')}: {v as number}</span>)}
            {Object.keys(ops).length === 0 && <span>Nothing recorded.</span>}
          </div>
          <ul className="space-y-1 text-xs">
            {(data.ops_recent as any[]).map((e, i) => (
              <li key={i} className="font-mono" style={soft}>
                <span style={muted}>{new Date(e.at).toLocaleString()}</span> {e.kind} {e.route ?? ''}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </>
  )
}

// One day's spend split by task, then every day as a table (newest first):
// total, and each task's total for that day.
function DayByTask({ routes, daily, labels, index, usd, onSelect }: { routes: any[]; daily: any[]; labels: string[]; index: number; usd: (m: number) => string; onSelect: (i: number) => void }) {
  const [all, setAll] = useState(false)
  if (!daily.length) return null
  const onDay = (i: number) => routes.map((r) => ({ route: r.route as string, cost: Number(r.daily?.[i] ?? 0) })).filter((r) => r.cost > 0).sort((a, b) => b.cost - a.cost)
  const today = onDay(index)
  const total = Number(daily[index]?.ai_cost ?? 0)
  const max = Math.max(...today.map((r) => r.cost), 1)
  const cols = routes.slice(0, 8)
  const rest = routes.slice(8)
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--ops-line)' }}>
      <p className="text-sm font-medium">{labels[index]}: <span className="tabular-nums">{usd(total)}</span> in total</p>
      {today.length === 0 ? (
        <p className="mt-2 text-sm" style={muted}>Nothing spent on this day.</p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {today.map((r) => (
            <div key={r.route} className="grid grid-cols-[minmax(120px,220px)_1fr_110px] items-center gap-3 text-sm">
              <span className="truncate font-mono text-xs" title={r.route}>{r.route}</span>
              <HBar value={r.cost} max={max} tip={<>{r.route}: {usd(r.cost)} ({pct(r.cost, total)} of the day)</>} />
              <span className="text-right text-xs tabular-nums" style={soft}>{usd(r.cost)} · {pct(r.cost, total)}</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setAll(!all)} className="mt-3 rounded-full px-3 py-1 text-xs" style={{ border: '1px solid var(--ops-line)', color: 'var(--ops-text-2)' }}>
        {all ? 'Hide the table' : 'Show every day as a table'}
      </button>
      {all && (
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-right" style={muted}>
                <th className="sticky left-0 pb-2 text-left font-normal" style={{ background: 'var(--ops-surface)' }}>day</th>
                <th className="px-2 font-semibold" style={{ color: 'var(--ops-text)' }}>total</th>
                {cols.map((r) => <th key={r.route} className="px-2 font-mono font-normal">{r.route}</th>)}
                {rest.length > 0 && <th className="px-2 font-normal">other</th>}
              </tr>
            </thead>
            <tbody>
              {daily.map((d, i) => i).reverse().map((i) => (
                <tr key={i} onClick={() => onSelect(i)} className="cursor-pointer border-t text-right tabular-nums hover:bg-white/[0.03]" style={{ borderColor: 'var(--ops-line)', background: i === index ? 'rgba(57,135,229,0.08)' : undefined }}>
                  <td className="sticky left-0 py-1.5 text-left" style={{ background: 'var(--ops-surface)' }}>{labels[i]}</td>
                  <td className="px-2 font-semibold">{usd(Number(daily[i].ai_cost))}</td>
                  {cols.map((r) => { const v = Number(r.daily?.[i] ?? 0); return <td key={r.route} className="px-2" style={v ? soft : muted}>{v ? usd(v) : '·'}</td> })}
                  {rest.length > 0 && (() => { const v = rest.reduce((a, r) => a + Number(r.daily?.[i] ?? 0), 0); return <td className="px-2" style={v ? soft : muted}>{v ? usd(v) : '·'}</td> })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SourceTable({ sources }: { sources: any[] }) {
  if (!sources.length) return <p className="text-sm" style={muted}>No signups in this window.</p>
  const max = Math.max(...sources.map((s) => s.signups), 1)
  return (
    <div className="space-y-2">
      {sources.slice(0, 12).map((s) => (
        <div key={s.source} className="grid grid-cols-[110px_1fr_110px] items-center gap-3 text-sm">
          <span className="truncate" title={s.source}>{s.source}</span>
          <div className="space-y-0.5">
            <HBar value={s.signups} max={max} height={7} color="var(--s1)" tip={<>{s.source}: {s.signups} signups</>} />
            <HBar value={s.started} max={max} height={7} color="var(--s3)" tip={<>{s.started} started a project ({pct(s.started, s.signups)})</>} />
            <HBar value={s.subscribed} max={max} height={7} color="var(--s2)" tip={<>{s.subscribed} subscribed ({pct(s.subscribed, s.signups)})</>} />
          </div>
          <span className="text-right text-xs tabular-nums" style={soft}>{s.signups} · {pct(s.started, s.signups)} · {pct(s.subscribed, s.signups)}</span>
        </div>
      ))}
      <div className="flex gap-3 pt-1 text-[11px]" style={soft}>
        {[['signups', 'var(--s1)'], ['started', 'var(--s3)'], ['subscribed', 'var(--s2)']].map(([l, c]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
      </div>
    </div>
  )
}

function Funnel({ f, trialsEnding, trialsExpired, repeat, blocked }: { f: any; trialsEnding: number; trialsExpired: number; repeat: number; blocked: number }) {
  const steps: [string, number, number?][] = [
    ['Signed up', f.signed_up],
    ['Finished onboarding', f.onboarded],
    ['Started a project', f.started_project],
    ['Active on 2+ days', f.active_2_days],
    ['Came back after day 7', f.back_after_day_7, f.old_enough_for_day_7],
    ['Subscribed', f.subscribed],
  ]
  return (
    <div className={card} style={cardStyle}>
      <div className="space-y-2">
        {steps.map(([label, v, base]) => (
          <div key={label} className="grid grid-cols-[170px_1fr_90px] items-center gap-3 text-sm">
            <span>{label}</span>
            <HBar value={v} max={Math.max(f.signed_up, 1)} height={14} color="var(--s1)" tip={<>{label}: {v} of {f.signed_up}{base !== undefined ? ` (${base} signed up 7+ days ago)` : ''}</>} />
            <span className="text-right tabular-nums" style={soft}>{v} · {pct(v, base ?? f.signed_up)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs" style={soft}>
        <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--ops-line)' }}>{trialsEnding} trials end in the next 7 days</span>
        <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--ops-line)' }}>{trialsExpired} trials ended without subscribing</span>
        <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--ops-line)' }}>{repeat} repeat-trial addresses</span>
        <span className="rounded-full px-2 py-0.5" style={{ border: '1px solid var(--ops-line)' }}>{blocked} disposable addresses refused</span>
      </div>
    </div>
  )
}

function RouteTable({ routes, usd, selected, onSelect }: { routes: any[]; usd: (m: number) => string; selected: string | null; onSelect: (r: string) => void }) {
  if (!routes.length) return <div className={card} style={cardStyle}><p className="text-sm" style={muted}>No AI calls recorded in this window yet.</p></div>
  const total = routes.reduce((a, r) => a + Number(r.cost), 0) || 1
  return (
    <div className={`${card} overflow-x-auto`} style={cardStyle}>
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider" style={muted}>
            <th className="pb-2">task</th><th>share of spend</th><th>per day</th><th className="text-right">calls</th><th className="text-right">total</th><th className="text-right">typical</th><th className="text-right">p95</th><th className="text-right">max</th><th className="text-right">cache</th><th className="text-right">cut off</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.route} onClick={() => onSelect(r.route)} className="cursor-pointer border-t hover:bg-white/[0.03]" style={{ borderColor: 'var(--ops-line)', background: r.route === selected ? 'rgba(57,135,229,0.08)' : undefined }}>
              <td className="py-2 pr-2 font-mono text-xs">{r.route}</td>
              <td className="w-32 pr-3"><HBar value={Number(r.cost)} max={total} tip={<>{r.route}: {pct(Number(r.cost), total)} of spend</>} /></td>
              <td><Spark values={r.daily ?? []} /></td>
              <td className="text-right tabular-nums">{r.calls}</td>
              <td className="text-right tabular-nums">{usd(Number(r.cost))}</td>
              <td className="text-right tabular-nums" style={soft}>{usd(r.p50)}</td>
              <td className="text-right tabular-nums" style={soft}>{usd(r.p95)}</td>
              <td className="text-right tabular-nums" style={r.max > 5 * r.p50 ? { color: 'var(--serious)' } : soft}>{usd(r.max)}</td>
              <td className="text-right tabular-nums" style={soft}>{Math.round(Number(r.cache_read_share) * 100)}%</td>
              <td className="text-right tabular-nums" style={r.cut_off ? { color: 'var(--serious)' } : soft}>{r.cut_off}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RouteDetail({ route, days, env, usd, norms }: { route: string; days: number; env: string; usd: (m: number) => string; norms?: RouteNorms }) {
  const [calls, setCalls] = useState<CallRow[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    setCalls(null)
    setSelected(null)
    fetch(`/api/admin/route-calls?route=${encodeURIComponent(route)}&days=${days}&env=${env}`)
      .then((r) => r.json())
      .then((d) => live && setCalls(d.calls ?? []))
    return () => { live = false }
  }, [route, days, env])

  const median = useMemo(() => {
    if (!calls?.length) return 0
    const s = calls.map((c) => c.cost).sort((a, b) => a - b)
    return s[Math.floor(s.length / 2)]
  }, [calls])
  const variants = useMemo(() => {
    const map = new Map<string, { n: number; cost: number }>()
    for (const c of calls ?? []) {
      const v = variantOf(c.context)
      const e = map.get(v) ?? { n: 0, cost: 0 }
      e.n++
      e.cost += c.cost
      map.set(v, e)
    }
    return [...map.entries()].sort((a, b) => b[1].cost - a[1].cost)
  }, [calls])

  if (!calls) return <div className={`${card} mt-3`} style={cardStyle}><p className="text-sm" style={muted}>Loading {route}…</p></div>
  const flagged = (c: CallRow) => (c.cost >= 3 * median && c.cost >= 5000) || c.stop === 'max_tokens'
  const chosen = calls.find((c) => c.id === selected) ?? calls.filter(flagged).sort((a, b) => b.cost - a.cost)[0]
  const maxVariant = Math.max(...variants.map(([, v]) => v.cost / v.n), 1)

  return (
    <div className={`${card} mt-3`} style={cardStyle}>
      <p className="text-sm font-medium"><span className="font-mono">{route}</span>: {calls.length} most recent calls</p>
      <p className="mb-2 text-xs" style={muted}>Each dot is one call. Orange = flagged. Click one to see what it carried.</p>
      <CostScatter
        points={calls.map((c) => ({
          t: new Date(c.at).getTime(),
          v: c.cost,
          flagged: flagged(c),
          id: c.id,
          label: <>{new Date(c.at).toLocaleString()}<br /><b>{usd(c.cost)}</b> · {k(c.input + c.cache_read + c.cache_write)} in / {k(c.output)} out{c.stop === 'max_tokens' ? ' · cut off' : ''}</>,
        }))}
        median={median}
        format={usd}
        selected={chosen?.id}
        onSelect={setSelected}
      />
      {variants.length > 1 && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs" style={muted}>Average cost per call, by variant</p>
          {variants.map(([v, s]) => (
            <div key={v} className="mb-1.5 grid grid-cols-[140px_1fr_120px] items-center gap-3 text-sm">
              <span className="truncate text-xs">{v}</span>
              <HBar value={s.cost / s.n} max={maxVariant} tip={<>{v}: {s.n} calls, {usd(s.cost / s.n)} each</>} />
              <span className="text-right text-xs tabular-nums" style={soft}>{usd(s.cost / s.n)} × {s.n}</span>
            </div>
          ))}
        </div>
      )}
      {chosen && <div className="mt-4"><CallCard call={{ ...chosen, median, ratio: median ? chosen.cost / median : undefined }} usd={usd} norms={norms} /></div>}
    </div>
  )
}

function CallCard({ call, usd, norms, showRoute }: { call: CallRow; usd: (m: number) => string; norms?: RouteNorms; showRoute?: boolean }) {
  const c = call.context ?? {}
  const sys = (c.sys as number[] | undefined) ?? []
  const parts = (c.parts as Record<string, number> | undefined) ?? {}
  const findings = diagnose(call, norms)
  const labels = Object.entries(c).filter(([key, v]) => !['sys', 'sysCached', 'turns', 'history', 'last', 'histCached', 'media', 'tools', 'max', 'parts'].includes(key) && typeof v !== 'object')
  return (
    <div className="rounded-xl p-3" style={{ background: 'rgba(236,233,226,0.03)', border: '1px solid var(--ops-line)' }}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        {showRoute && <span className="font-mono text-xs">{call.route}</span>}
        <span className="font-semibold tabular-nums">{usd(call.cost)}</span>
        {call.ratio ? <span className="text-xs" style={{ color: 'var(--serious)' }}>{Number(call.ratio).toFixed(1)}× median ({usd(call.median ?? 0)})</span> : null}
        <span className="text-xs" style={muted}>{new Date(call.at).toLocaleString()} · {call.model}{call.ms ? ` · ${(call.ms / 1000).toFixed(1)}s` : ''} · user {call.user ?? 'deleted'}</span>
        {labels.map(([key, v]) => <span key={key} className="rounded-full px-2 py-0.5 text-[11px]" style={{ border: '1px solid var(--ops-line)', color: 'var(--ops-text-2)' }}>{key}: {String(v)}</span>)}
      </div>
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider" style={muted}>Tokens billed</p>
          <StackBar
            format={k}
            segments={[
              { label: 'from cache', value: call.cache_read, color: SERIES[0] },
              { label: 'written to cache', value: call.cache_write, color: SERIES[1] },
              { label: 'fresh input', value: call.input, color: SERIES[2] },
              { label: 'output', value: call.output, color: SERIES[3] },
            ]}
          />
        </div>
        <div>
          <p className="mb-1 text-[11px] uppercase tracking-wider" style={muted}>What was sent (characters)</p>
          {Object.keys(parts).length > 0 ? (
            <StackBar
              format={k}
              segments={[
                ...Object.entries(parts).map(([name, v], i) => ({ label: name.replace(/_/g, ' '), value: v, color: SERIES[i % SERIES.length] })),
                { label: 'history', value: Number(c.history ?? 0), color: 'rgba(236,233,226,0.35)' },
              ]}
            />
          ) : (
            <StackBar
              format={k}
              segments={[
                ...sys.map((v, i) => ({ label: `system block ${i + 1}${i === 0 && c.sysCached ? ' (cached)' : ''}`, value: v, color: SERIES[i % SERIES.length] })),
                { label: `history (${c.turns ?? 0} msgs)`, value: Number(c.history ?? 0), color: 'rgba(236,233,226,0.35)' },
                { label: 'newest message', value: Number(c.last ?? 0), color: 'rgba(236,233,226,0.6)' },
              ]}
            />
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {findings.map((f, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: `var(--${f.level})` }} aria-label={f.level} />
            <span>
              {f.text}
              {f.tweak && <span className="block text-xs" style={muted}>→ {f.tweak}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Cohorts({ cohorts }: { cohorts: any[] }) {
  const { show, hide } = useTip()
  if (!cohorts.length) return <div className={card} style={cardStyle}><p className="text-sm" style={muted}>No signups in the last eight weeks.</p></div>
  return (
    <div className={`${card} overflow-x-auto`} style={cardStyle}>
      <table className="text-xs" onMouseLeave={hide}>
        <thead>
          <tr style={muted}><th className="pb-2 pr-3 text-left font-normal">week of</th><th className="pr-3 text-right font-normal">people</th>{Array.from({ length: 8 }, (_, i) => <th key={i} className="w-12 font-normal">wk {i}</th>)}</tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <td className="pr-3">{new Date(c.week + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</td>
              <td className="pr-3 text-right tabular-nums">{c.size}</td>
              {Array.from({ length: 8 }, (_, i) => {
                const v = c.weeks?.[i]
                const share = v === undefined ? null : c.size ? v / c.size : 0
                return (
                  <td key={i} className="p-0.5">
                    {share === null ? null : (
                      <div
                        className="flex h-8 items-center justify-center rounded tabular-nums"
                        style={{ background: share > 0 ? rampColor(share) : 'rgba(236,233,226,0.04)', color: share > 0.45 ? '#fff' : share > 0 ? '#0d0c0b' : 'var(--ops-muted)' }}
                        onMouseMove={(e) => show(e, <>Week of {c.week}, week {i}: {v} of {c.size} active</>)}
                      >
                        {Math.round(share * 100)}%
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
