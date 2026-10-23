'use client'

// /admin/people: usage analytics, a person at a time. Who uses which parts of
// the project side of the app, and how each of their projects came to be:
// dates, counts and stages. No title, no text, nothing from check-ins (see
// lib/usage-analytics.ts). The data arrives through `source`, so the preview
// page (/dev/people) can show the same screen with made-up people.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { OpsRoot, Spark } from '@/components/admin/charts'
import type { PersonSummary, ProjectStory } from '@/lib/ops/people'

export interface ListData { people: PersonSummary[]; switchedOff: number; notYetTold: number }
export interface PersonData { person: PersonSummary; projects: ProjectStory[]; writing: { date: string; minutes: number }[] }
export interface PeopleSource {
  list: () => Promise<ListData>
  person: (id: string) => Promise<PersonData>
}

const card = 'rounded-2xl p-4 md:p-5'
const cardStyle = { background: 'var(--ops-surface)', border: '1px solid var(--ops-line)' }
const muted = { color: 'var(--ops-muted)' }
const soft = { color: 'var(--ops-text-2)' }

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : day(iso)
}
const usd = (v: number) => (v === 0 ? '$0' : v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(3)}`)
const eur = (v: number) => `${v < 0 ? '−' : ''}€${Math.abs(v) >= 100 ? Math.abs(v).toFixed(0) : Math.abs(v).toFixed(2)}`
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`
const PRACTICE: Record<string, string> = { writer: 'Writer', songwriter: 'Songwriter', cinematographer: 'Cinematographer', creator: 'Content creator', client: 'Client projects', director: 'Creative director' }
const SHELF = { queued: 'In the queue', active: 'Active', completed: 'Completed' } as const

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'good' }) {
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px]" style={{ border: `1px solid ${tone === 'good' ? 'var(--good)' : 'var(--ops-line)'}`, color: 'var(--ops-text-2)' }}>
      {children}
    </span>
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

export function PeopleView({ source }: { source: PeopleSource }) {
  const [list, setList] = useState<ListData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [detail, setDetail] = useState<PersonData | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  useEffect(() => {
    source.list().then((d) => { setList(d); setChosen((c) => c ?? d.people[0]?.id ?? null) }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load.'))
  }, [source])

  useEffect(() => {
    if (!chosen) return
    let current = true
    setDetail(null)
    setDetailError(null)
    source.person(chosen).then((d) => current && setDetail(d)).catch((e) => current && setDetailError(e instanceof Error ? e.message : 'Could not load.'))
    return () => { current = false }
  }, [chosen, source])

  return (
    <OpsRoot>
      <div className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:px-8">
        <header>
          <Link href="/admin" className="text-xs underline underline-offset-4" style={muted}>← Operations</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">People</h1>
          <p className="mt-1 max-w-2xl text-xs" style={muted}>
            Usage analytics: which parts of a project each person uses, and how each project came to be. Dates, counts and stages only. No titles, nothing
            anyone wrote, and nothing from check-ins.
          </p>
          {list && (
            <p className="mt-2 text-xs" style={soft}>
              {plural(list.people.length, 'person shares', 'people share')} usage analytics
              {list.switchedOff > 0 && ` · ${list.switchedOff} switched off`}
              {list.notYetTold > 0 && ` · ${list.notYetTold} not shown yet, because they have not been told`}
            </p>
          )}
        </header>

        {error && <p className="mt-6 text-sm" style={{ color: 'var(--critical)' }}>{error}</p>}
        {list && list.people.length === 0 && (
          <p className="mt-8 text-sm" style={soft}>Nobody to show yet. A person appears here once they have been told about usage analytics and left them on.</p>
        )}

        {list && list.people.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
            <nav aria-label="People" className="flex flex-col gap-2 md:max-h-[calc(100dvh-140px)] md:overflow-y-auto">
              {list.people.map((p) => {
                const on = p.id === chosen
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setChosen(p.id)}
                    aria-current={on ? 'true' : undefined}
                    className="cursor-pointer rounded-2xl p-3.5 text-left"
                    style={{ background: on ? 'rgba(236,233,226,0.08)' : 'var(--ops-surface)', border: `1px solid ${on ? 'var(--ops-text-2)' : 'var(--ops-line)'}` }}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{p.name || p.email}</span>
                      <Chip>{p.plan}</Chip>
                    </span>
                    {p.name && <span className="mt-0.5 block truncate text-[11px]" style={muted}>{p.email}</span>}
                    <span className="mt-1.5 block text-xs" style={soft}>
                      {plural(p.projects.total, 'project')}
                      {p.projects.completed > 0 && ` · ${p.projects.completed} finished`}
                    </span>
                    <span className="block text-[11px]" style={muted}>Last at work {ago(p.lastActive)}</span>
                    {p.money && (
                      <span className="mt-1 block text-[11px] tabular-nums" style={muted}>
                        Cost {usd(p.money.costUsd)} · worth {eur(p.money.valueEur)} so far
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>

            <main className="min-w-0">
              {detailError && <p className="text-sm" style={{ color: 'var(--critical)' }}>{detailError}</p>}
              {!detail && !detailError && <p className="text-sm" style={muted}>Loading…</p>}
              {detail && <Person data={detail} />}
            </main>
          </div>
        )}
      </div>
    </OpsRoot>
  )
}

// Which parts of the app, counted across all of a person's projects.
const PARTS: { label: string; of: (c: ProjectStory['counts']) => number }[] = [
  { label: 'Pieces', of: (c) => c.pieces },
  { label: 'Pieces divided into parts', of: (c) => c.parts },
  { label: 'Threads', of: (c) => c.threads },
  { label: 'Tasks', of: (c) => c.tasks },
  { label: 'Images on the canvas', of: (c) => c.images },
  { label: 'Recordings on the canvas', of: (c) => c.recordings },
  { label: 'Task lists on the canvas', of: (c) => c.taskLists },
  { label: 'Anchor lines', of: (c) => c.anchorLines },
  { label: 'Changes to the core concept', of: (c) => c.conceptEdits },
  { label: 'Talk about the vision', of: (c) => c.visionTurns },
  { label: 'Companion inside a piece', of: (c) => c.partTurns },
  { label: 'Rules checked against the writing', of: (c) => c.ruleChecks },
  { label: 'Reflections on finished pieces', of: (c) => c.reflections },
]

function Person({ data }: { data: PersonData }) {
  const { person: p, projects, writing } = data
  const words = projects.reduce((s, pr) => s + pr.counts.words, 0)
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{p.name || p.email}</h2>
        {p.name && <span className="text-xs" style={muted}>{p.email}</span>}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs" style={soft}>
        <Chip>{p.plan}</Chip>
        {p.practices.map((k) => <Chip key={k}>{PRACTICE[k] ?? k}</Chip>)}
        <span style={muted}>Joined {day(p.joined)} · last at work {ago(p.lastActive)}</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Projects" value={String(p.projects.total)} sub={`${p.projects.active} active · ${p.projects.queued} in the queue · ${p.projects.completed} completed`} />
        <Tile label="Words in projects" value={words.toLocaleString()} sub="as they stand now" />
        <Tile label="Days written" value={String(p.writingDays)} sub="in the last 30" />
        <Tile label="Time writing" value={p.writingMinutes >= 90 ? `${(p.writingMinutes / 60).toFixed(1)} h` : `${p.writingMinutes} min`} sub="in the last 30 days">
          <Spark values={writing.map((w) => w.minutes)} width={150} />
        </Tile>
      </div>

      {p.money && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">What they cost and bring in</h3>
          <p className="mt-0.5 text-xs" style={muted}>
            Cost is exact, in dollars as billed. Income is estimated from their plan at list price; net is after tax and Stripe’s fees.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Companion cost" value={usd(p.money.costUsd)} sub={`${p.money.calls.toLocaleString()} calls · ${usd(p.money.cost30Usd)} in the last 30 days`}>
              {p.money.costByMonth.length > 1 && <Spark values={p.money.costByMonth.map((c) => c.usd)} width={150} color="var(--s2)" />}
            </Tile>
            <Tile label="Cost per month" value={usd(p.money.costPerMonthUsd)} sub="on average, since their first call" />
            <Tile label="Paid so far" value={`about ${eur(p.money.paidEur)}`} sub={p.money.paidEur > 0 ? `${eur(p.money.netEur)} net · ${plural(p.money.monthsPaying, 'month')} on a plan${p.money.paying ? '' : ' · not paying now'}` : 'never on a paid plan'} />
            <Tile label="Lifetime value so far" value={eur(p.money.valueEur)} sub="net income less their cost" />
          </div>
        </section>
      )}

      {projects.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold">Which parts they use</h3>
          <div className={`${card} mt-2`} style={cardStyle}>
            <table className="w-full text-xs">
              <thead>
                <tr style={muted}>
                  <th className="pb-1.5 text-left font-normal">Part of the app</th>
                  <th className="pb-1.5 text-right font-normal">Projects using it</th>
                  <th className="pb-1.5 text-right font-normal">In all</th>
                </tr>
              </thead>
              <tbody>
                {PARTS.map((part) => {
                  const using = projects.filter((pr) => part.of(pr.counts) > 0).length
                  const total = projects.reduce((s, pr) => s + part.of(pr.counts), 0)
                  return (
                    <tr key={part.label} style={{ borderTop: '1px solid var(--ops-line)', color: using ? 'var(--ops-text)' : 'var(--ops-muted)' }}>
                      <td className="py-1.5">{part.label}</td>
                      <td className="py-1.5 text-right tabular-nums">{using} of {projects.length}</td>
                      <td className="py-1.5 text-right tabular-nums">{total.toLocaleString()}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-6">
        <h3 className="text-sm font-semibold">How each project came to be</h3>
        <p className="mt-0.5 text-xs" style={muted}>Numbered in the order they were started. Titles are not shown.</p>
        {projects.length === 0 && <p className="mt-3 text-sm" style={soft}>No projects yet.</p>}
        <div className="mt-3 flex flex-col gap-3">
          {[...projects].reverse().map((pr) => <Project key={pr.id} story={pr} />)}
        </div>
      </section>
    </div>
  )
}

function Project({ story: s }: { story: ProjectStory }) {
  const c = s.counts
  const facts = [
    plural(c.pieces, 'piece'),
    c.parts > 0 && plural(c.parts, 'part'),
    `${c.words.toLocaleString()} words`,
    c.threads > 0 && plural(c.threads, 'thread'),
    c.tasks > 0 && `${c.tasksDone} of ${plural(c.tasks, 'task')} done`,
    c.images > 0 && plural(c.images, 'image'),
    c.recordings > 0 && plural(c.recordings, 'recording'),
  ].filter(Boolean)
  return (
    <article className={card} style={cardStyle}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base font-semibold">Project {s.n}</h4>
        <Chip tone={s.stage === 'Finished' ? 'good' : 'plain'}>{s.stage}</Chip>
        <Chip>{s.resting ? 'Resting' : SHELF[s.shelf]}</Chip>
        <span className="text-[11px]" style={muted}>Started {day(s.started)} · last opened {ago(s.lastOpened)}</span>
      </div>
      <p className="mt-1.5 text-xs" style={soft}>{facts.join(' · ')}</p>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <ol className="relative ml-1.5" style={{ borderLeft: '1px solid var(--ops-line)' }}>
          {s.steps.map((step) => (
            <li key={step.key} className="relative pb-2.5 pl-4 last:pb-0">
              <span aria-hidden className="absolute -left-[4px] top-[5px] h-[7px] w-[7px] rounded-full" style={{ background: step.key === 'finished' ? 'var(--good)' : 'var(--ops-text-2)' }} />
              <span className="text-xs">{step.label}</span>
              <span className="ml-2 text-[11px] tabular-nums" style={muted}>
                {day(step.at)}{step.daysAfter > 0 && ` · ${plural(step.daysAfter, 'day')} later`}
              </span>
            </li>
          ))}
        </ol>
        {s.words.length > 1 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider" style={muted}>Words over time</p>
            <div className="mt-1.5"><Spark values={s.words.map((w) => w.words)} width={200} height={40} color="var(--s3)" /></div>
            <p className="mt-1 text-[11px] tabular-nums" style={muted}>{day(s.words[0].at)} → {day(s.words.at(-1)!.at)}</p>
          </div>
        )}
      </div>

      {s.untouched.length > 0 && (
        <p className="mt-3 text-[11px]" style={muted}>Not yet in this project: {s.untouched.join(', ')}.</p>
      )}
    </article>
  )
}
