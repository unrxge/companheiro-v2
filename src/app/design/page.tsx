'use client'

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { PrimaryButton, QuietButton, GhostButton, DangerButton } from '@/components/ui/buttons'
import { TextField, TextArea } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { MicButton } from '@/components/ui/mic-button'
import { IconButton } from '@/components/ui/icon-button'
import { UnderlineLink } from '@/components/ui/underline-link'
import {
  ProportionBar,
  ChevronChain,
  StageRibbon,
  WeatherStrip,
  PhaseDots,
  FacetCloud,
  SignalCards,
  JourneyCurve,
  ThreadMap,
  type WeatherDay,
  type Signals,
} from '@/components/widgets'
import { fonts, radius, shell, type as typeRoles, atmosphereHues, type Mood, type Arc } from '@/lib/design-tokens'

// ── Sample data (plainly examples; nothing here is read from the database) ──
const ARCS: Arc[] = ['Breakaway', 'Beginning', 'Expansion', 'Integration']
const WEATHER_WORDS = ['foggy but clearing', 'steady', 'stormy', 'bright', 'tender', 'restless', 'settled', 'raw', 'open']
const SAMPLE_DAYS: WeatherDay[] = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 7, 8 + i)
  const skip = i % 7 === 3 || i % 11 === 5
  const energy = (['low', 'medium', 'high'] as const)[(i * 7 + 2) % 3]
  return {
    date: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
    energy: skip ? null : energy,
    arc: skip ? null : ARCS[Math.floor(i / 4) % 4],
    weather: skip ? null : WEATHER_WORDS[i % WEATHER_WORDS.length],
  }
})

const PHASES = ['First Contact', 'Expansion', 'The Reader', 'The Principle', 'Declaration']

const JOURNEY = 'Arrival: the kettle before the day\nThe pull toward speed\nWhat slowness keeps noticing\nA morning that holds you\nThe body sets the pace'

export default function DesignGalleryPage() {
  const { t, theme } = useTheme()
  const [mood, setMood] = useState<Mood>('ember')
  const [intensity, setIntensity] = useState(1)
  const [recording, setRecording] = useState(false)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('The kettle starts before I do.')
  const [signals, setSignals] = useState<Signals>({ energy: 'low', inner_weather: 'foggy but clearing', arc_texture: 'Integration' })
  const [phase, setPhase] = useState(3)

  const label: React.CSSProperties = { ...typeRoles.eyebrow, color: t.textMuted, marginBottom: 12 }

  return (
    <PageShell mood={mood} intensity={intensity}>
      <PageHeader
        eyebrow="Design system · Inner Weather"
        title={
          <>
            Every piece of the language, <em style={{ fontStyle: 'italic', color: t.ember }}>alive</em>
          </>
        }
        subtitle="Tokens, primitives and the widget kit, rendered in the real app. Nothing on this page reads your data; every figure is an example."
        back="/home"
      />

      {/* ── Atmosphere controls ── */}
      <Container>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 320px' }}>
            <p style={label}>Atmosphere · mood</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(Object.keys(atmosphereHues) as Mood[]).map((m) => (
                <Pill key={m} hue={m === 'neutral' ? 'neutral' : m} selected={mood === m} onClick={() => setMood(m)} size="md" dot={m !== 'neutral'}>
                  {m}
                </Pill>
              ))}
            </div>
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 12, maxWidth: '60ch' }}>
              The shell takes the module&apos;s hue (Ideas lean ember, Board leans verdant, Portrait leans violet). On Home and Check-in it takes your last arc texture instead, and energy sets how present it is.
            </p>
          </div>
          <div style={{ flex: '0 1 260px' }}>
            <p style={label}>Intensity · energy {Math.round(intensity * 100)}%</p>
            <input type="range" min={35} max={100} value={Math.round(intensity * 100)} onChange={(e) => setIntensity(Number(e.target.value) / 100)} aria-label="Atmosphere intensity" style={{ width: '100%', accentColor: t.ember }} />
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 8 }}>Container theme: <b style={{ color: t.textPrimary }}>{theme}</b> (toggle in the header).</p>
          </div>
        </div>
      </Container>

      {/* ── Palette + type ── */}
      <Container style={{ marginTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card>
            <p style={label}>Meaning palette · this theme&apos;s steps</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: 10 }}>
              {(['ember', 'verdant', 'violet', 'ochre', 'tide', 'danger'] as const).map((k) => (
                <div key={k} style={{ borderRadius: radius.widget, overflow: 'hidden', backgroundColor: t.cardBgInner }}>
                  <div style={{ height: 56, backgroundColor: t[k] }} />
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ ...typeRoles.small, fontWeight: 600, color: t.textPrimary }}>{k}</div>
                    <div style={{ ...typeRoles.mono, fontSize: 11, color: t.textMuted }}>{t[k]}</div>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 12 }}>
              Arc → hue: Breakaway ember, Beginning verdant, Expansion violet, Integration ochre. Board columns: Queue ochre, Active verdant, Completed violet. The app&apos;s own vocabulary is its colour system.
            </p>
          </Card>
          <Card>
            <p style={label}>Type · Fraunces for voices, Geist for the interface</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ ...typeRoles.display, color: t.textPrimary }}>Good evening</div>
              <div style={{ ...typeRoles.h2, color: t.textPrimary }}>The question is waiting.</div>
              <div style={{ ...typeRoles.quote, color: t.textPrimary }}>Devotion that has become performance, creative block as self-protection.</div>
              <Divider />
              <div style={{ ...typeRoles.h3, color: t.textPrimary }}>Begin conceptualisation</div>
              <div style={{ ...typeRoles.ui, color: t.textSecondary, maxWidth: '60ch' }}>Body copy stays in Geist. It is quieter than Inter at small sizes and already in the project.</div>
              <div style={{ ...typeRoles.eyebrow, color: t.textMuted }}>In progress</div>
              <div style={{ ...typeRoles.mono, color: t.textSecondary }}>1,840 words · saved</div>
            </div>
          </Card>
        </div>
      </Container>

      {/* ── Primitives ── */}
      <Container style={{ marginTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card>
            <p style={label}>Buttons · two shapes, plus ghost and danger</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <PrimaryButton onClick={() => {}}>Generate a question</PrimaryButton>
              <QuietButton onClick={() => {}}>Capture</QuietButton>
              <GhostButton onClick={() => {}}>Change</GhostButton>
              <DangerButton onClick={() => {}}>Forget this</DangerButton>
              <PrimaryButton onClick={() => {}} loading loadingLabel="Summoning…">Generate</PrimaryButton>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 14 }}>
              <PrimaryButton size="sm" onClick={() => {}}>Small</PrimaryButton>
              <QuietButton size="lg" onClick={() => {}}>Large quiet</QuietButton>
              <UnderlineLink href="#" color={t.textSecondary}>Underline link →</UnderlineLink>
              <IconButton ariaLabel="Example icon button" onClick={() => {}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={shell.text} strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </IconButton>
            </div>
          </Card>
          <Card>
            <p style={label}>Fields · boxed, bare and voice</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <TextField value={text} onChange={setText} placeholder="Paste a link that inspired you" ariaLabel="Example field" />
              <TextArea value={voice} onChange={setVoice} voice placeholder="Your words…" ariaLabel="Example voice field" minRows={2} />
              <TextArea value={voice} onChange={setVoice} voice bare placeholder="Bare voice field" ariaLabel="Example bare field" minRows={1} style={{ fontSize: 20, fontWeight: 500 }} />
            </div>
          </Card>
          <Card>
            <p style={label}>Pills · colour has a job</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Pill hue="ember" dot>Breakaway</Pill>
              <Pill hue="verdant" dot>Beginning</Pill>
              <Pill hue="violet" dot>Expansion</Pill>
              <Pill hue="ochre" dot>Integration</Pill>
              <Pill hue="tide">companion</Pill>
              <Pill hue="danger">unresolved</Pill>
              <Pill>4 items</Pill>
              <Pill hue="verdant" solid>Active</Pill>
            </div>
            <Divider style={{ margin: '16px 0' }} />
            <p style={label}>Mic · the same object everywhere</p>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <MicButton recording={recording} onToggle={() => setRecording((r) => !r)} />
              <MicButton recording={recording} onToggle={() => setRecording((r) => !r)} size={44} />
              <span style={{ ...typeRoles.small, color: t.textSecondary }}>{recording ? 'Recording' : 'Tap to record'}</span>
            </div>
          </Card>
        </div>
      </Container>

      {/* ── Widgets ── */}
      <Container style={{ marginTop: 24 }}>
        <div style={{ marginBottom: 20 }}>
          <Eyebrow>Widget kit</Eyebrow>
          <h2 style={{ ...typeRoles.h2, color: t.textPrimary, marginTop: 8 }}>Prose that describes a state becomes one of these</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <Card>
            <p style={label}>WeatherStrip · 30 days of check-in signals</p>
            <WeatherStrip days={SAMPLE_DAYS} />
          </Card>
          <Card>
            <p style={label}>SignalCards · tap to correct</p>
            <SignalCards signals={signals} onChange={setSignals} />
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 12 }}>Shown after the companion replies, before Log. What you confirm is what gets stored.</p>
          </Card>
          <Card>
            <p style={label}>ProportionBar · Ideas</p>
            <ProportionBar segments={[{ label: 'Queue', value: 4, hue: 'ochre' }, { label: 'Active', value: 3, hue: 'verdant' }, { label: 'Completed', value: 6, hue: 'violet' }]} />
          </Card>
          <Card>
            <p style={label}>StageRibbon · full, and compact for cards</p>
            <StageRibbon step="test" hrefFor={() => '#'} />
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Card inner padding={12}>
                <div style={{ fontFamily: fonts.display, fontSize: 14, color: t.textPrimary }}>The Weight of an Unhurried Morning</div>
                <div style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, margin: '4px 0 8px' }}>14 Aug · Integration · Slow living</div>
                <StageRibbon step="test" compact />
              </Card>
              <Card inner padding={12}>
                <div style={{ fontFamily: fonts.display, fontSize: 14, color: t.textPrimary }}>What the Body Keeps</div>
                <div style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, margin: '4px 0 8px' }}>2 Sep · Expansion · Masculinity</div>
                <StageRibbon step="write" compact />
              </Card>
            </div>
          </Card>
          <Card>
            <p style={label}>ChevronChain · emotional journey as a continuum</p>
            <ChevronChain beats={JOURNEY.split('\n').map((label) => ({ label }))} />
          </Card>
          <Card>
            <p style={label}>JourneyCurve · hover a beat</p>
            <JourneyCurve text={JOURNEY} />
          </Card>
          <Card>
            <p style={label}>PhaseDots · Conceptualise</p>
            <PhaseDots phase={phase} labels={PHASES} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <GhostButton size="sm" onClick={() => setPhase((p) => Math.max(1, p - 1))}>Back</GhostButton>
              <GhostButton size="sm" onClick={() => setPhase((p) => Math.min(5, p + 1))}>Advance</GhostButton>
            </div>
          </Card>
          <Card>
            <p style={label}>FacetCloud · the portrait</p>
            <FacetCloud
              facets={[
                { id: '1', statement: 'circles back to the body', weight: 1, freshness: 1, onClick: () => {} },
                { id: '2', statement: 'needs a question, not advice', weight: 0.6, freshness: 0.9, onClick: () => {} },
                { id: '3', statement: 'writes from anger first', weight: 0.5, freshness: 0.7, onClick: () => {} },
                { id: '4', statement: 'avoids mornings', weight: 0.2, freshness: 0.4, onClick: () => {} },
                { id: '5', statement: 'ideas arrive as titles', weight: 0.4, freshness: 0.85, onClick: () => {} },
              ]}
            />
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 12 }}>Size is reinforcement, opacity is freshness. The cap and the decay become visible.</p>
          </Card>
          <Card style={{ gridColumn: '1 / -1' }}>
            <p style={label}>ThreadMap · published pieces and the threads between them</p>
            <ThreadMap
              nodes={[
                { id: 'a', label: 'Making as Prayer', weight: 0.4 },
                { id: 'b', label: 'The Body Knows', weight: 1 },
                { id: 'c', label: 'Armor, Inherited', weight: 0.6 },
                { id: 'd', label: 'Sunday, Unhurried', weight: 0.3 },
                { id: 'e', label: 'What the silence protects', open: true, weight: 0.5 },
              ]}
              edges={[
                { from: 'a', to: 'b' },
                { from: 'b', to: 'c' },
                { from: 'b', to: 'd' },
                { from: 'c', to: 'e', tentative: true },
              ]}
            />
          </Card>
        </div>
      </Container>
    </PageShell>
  )
}
