'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'

type Arc = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
type Territory =
  | 'creativity_devotion_curiosity'
  | 'healthy_masculinity_emotional_regulation'
  | 'inner_child_tending_expression'
  | 'slow_living_life_in_service'

interface Capture {
  id: string
  unpacked: string
  arc: string
  thematic_territory: string
  created_at: string
}

interface Continuation {
  natural_continuations: string[]
  what_it_opened: string
}

const ARC_DEFINITIONS: Record<Arc, string> = {
  Breakaway: 'Disruption, stepping away from what no longer serves',
  Beginning: 'Fresh starts, emergence, new possibilities',
  Expansion: 'Growth, deepening, broadening horizons',
  Integration: 'Synthesis, wholeness, bringing it together',
}

const TERRITORIES: Territory[] = [
  'creativity_devotion_curiosity',
  'healthy_masculinity_emotional_regulation',
  'inner_child_tending_expression',
  'slow_living_life_in_service',
]

const TERRITORY_LABELS: Record<string, string> = {
  creativity_devotion_curiosity: 'Creativity, devotion & curiosity',
  healthy_masculinity_emotional_regulation: 'Healthy masculinity & emotional regulation',
  inner_child_tending_expression: 'Inner child tending & expression',
  slow_living_life_in_service: 'Slow living & life in service',
}

const TERRITORY_SHORT: Record<string, string> = {
  creativity_devotion_curiosity: 'Creativity & Devotion',
  healthy_masculinity_emotional_regulation: 'Healthy Masculinity',
  inner_child_tending_expression: 'Inner Child',
  slow_living_life_in_service: 'Slow Living',
}

const ENERGY_LEVELS = ['heavy', 'low', 'steady', 'light', 'bright'] as const
type EnergyLevel = (typeof ENERGY_LEVELS)[number]
const ENERGY_LEVEL_LABELS: Record<EnergyLevel, string> = {
  heavy: 'Heavy',
  low: 'Low',
  steady: 'Steady',
  light: 'Light',
  bright: 'Bright',
}

export default function IdeaLabPage() {
  const router = useRouter()
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

  const [selectedArcs, setSelectedArcs] = useState<Arc[]>([])
  const [skipArcs, setSkipArcs] = useState(false)
  const [useRandomArcs, setUseRandomArcs] = useState(false)
  const [selectedTerritories, setSelectedTerritories] = useState<Territory[]>([])
  const [skipTerritories, setSkipTerritories] = useState(false)
  const [useRandomTerritories, setUseRandomTerritories] = useState(false)
  const [energyIndex, setEnergyIndex] = useState(2)
  const energyLevel = ENERGY_LEVELS[energyIndex]
  const [impersonal, setImpersonal] = useState(true)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [continuations, setContinuations] = useState<Continuation[]>([])
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoveredCapture, setHoveredCapture] = useState<string | null>(null)
  const [hoveredThread, setHoveredThread] = useState<number | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [capturesRes, continuationsRes] = await Promise.all([
          fetch('/api/idea-lab/captures'),
          fetch('/api/idea-lab/continuations'),
        ])
        const capturesData = await capturesRes.json()
        const continuationsData = await continuationsRes.json()
        setCaptures(capturesData.captures || [])
        setContinuations(continuationsData.continuations || [])
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setIsLoadingCaptures(false)
      }
    }
    fetchData()
  }, [])

  const toggleArc = (arc: Arc) => {
    setSelectedArcs((prev) =>
      prev.includes(arc) ? prev.filter((a) => a !== arc) : [...prev, arc]
    )
  }

  const handleRandomArcs = () => {
    const next = !useRandomArcs
    setUseRandomArcs(next)
    if (next) { setSkipArcs(false); setSelectedArcs([]) }
  }

  const handleSkipArcs = () => {
    const next = !skipArcs
    setSkipArcs(next)
    if (next) { setUseRandomArcs(false); setSelectedArcs([]) }
  }

  const toggleTerritory = (t: Territory) => {
    setSelectedTerritories((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    )
  }

  const handleRandomTerritories = () => {
    const next = !useRandomTerritories
    setUseRandomTerritories(next)
    if (next) { setSkipTerritories(false); setSelectedTerritories([]) }
  }

  const handleSkipTerritories = () => {
    const next = !skipTerritories
    setSkipTerritories(next)
    if (next) { setUseRandomTerritories(false); setSelectedTerritories([]) }
  }

  const handleGeneratePrompt = async () => {
    if (!skipArcs && selectedArcs.length === 0 && !useRandomArcs) {
      setError('Select at least one arc, use random, or skip arcs')
      return
    }
    if (skipArcs && selectedTerritories.length === 0 && !useRandomTerritories) {
      setError('Skipping arcs needs a territory — select one or use random')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const payload: Record<string, unknown> = { energy: energyLevel, impersonal }

      if (skipArcs) payload.arcs = null
      else if (useRandomArcs) payload.randomArcs = true
      else payload.arcs = selectedArcs

      if (skipTerritories) payload.territories = null
      else if (useRandomTerritories) payload.randomTerritories = true
      else if (selectedTerritories.length > 0) payload.territories = selectedTerritories

      const res = await fetch('/api/idea-lab/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (data.prompt) {
        setGeneratedPrompt(data.prompt)
      } else {
        setError('Failed to generate — try again')
      }
    } catch {
      setError('Failed to generate. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const isGenerateDisabled =
    (!skipArcs && selectedArcs.length === 0 && !useRandomArcs) || isGenerating

  // Style helpers
  const lbl: React.CSSProperties = {
    fontFamily: 'var(--font-geist-sans)',
    fontSize: '10px',
    fontWeight: 600,
    color: c.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    display: 'block',
  }

  const pill = (active: boolean, muted: boolean): React.CSSProperties => ({
    padding: '7px 13px',
    borderRadius: '999px',
    border: `1px solid ${active ? 'transparent' : c.inputBorder}`,
    backgroundColor: active ? accentColor : 'transparent',
    color: active ? '#fff' : c.textSecondary,
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    cursor: muted ? 'default' : 'pointer',
    opacity: muted && !active ? 0.35 : 1,
    transition: 'all 0.15s ease',
    lineHeight: 1,
  })

  const micro = (active: boolean): React.CSSProperties => ({
    padding: '3px 9px',
    borderRadius: '6px',
    border: `1px solid ${active ? c.textMuted : c.inputBorder}`,
    backgroundColor: active ? c.inputBg : 'transparent',
    color: active ? c.textPrimary : c.textMuted,
    fontSize: '11px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  const hdivider: React.CSSProperties = {
    height: '1px',
    backgroundColor: c.divider,
    margin: '20px -24px',
  }

  const capturesCard = (
    <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
        <span style={{ ...lbl }}>Capture Bank</span>
        {!isLoadingCaptures && (
          <span style={{ fontSize: '11px', color: c.textMuted }}>
            {captures.length} {captures.length === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {isLoadingCaptures ? (
        <p style={{ fontSize: '13px', color: c.textMuted, margin: 0 }}>Loading...</p>
      ) : captures.length === 0 ? (
        <p style={{ fontSize: '13px', color: c.textMuted, lineHeight: 1.5, margin: 0 }}>
          No captures yet.{' '}
          <Link href="/collector" style={{ color: accentColor, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
            Start with Collector →
          </Link>
        </p>
      ) : (
        captures.map((capture, idx) => (
          <div
            key={capture.id}
            onMouseEnter={() => setHoveredCapture(capture.id)}
            onMouseLeave={() => setHoveredCapture(null)}
            style={{
              padding: '12px 8px 12px 12px',
              marginLeft: '-12px',
              borderLeft: `2px solid ${hoveredCapture === capture.id ? accentColor : 'transparent'}`,
              borderBottom: idx < captures.length - 1 ? `1px solid ${c.divider}` : 'none',
              transition: 'border-left-color 0.15s ease',
            }}
          >
            <p style={{ fontSize: '13px', color: c.textPrimary, margin: '0 0 6px', lineHeight: 1.5 }}>
              {capture.unpacked}
            </p>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', color: c.textMuted }}>{capture.arc}</span>
              {capture.thematic_territory && (
                <>
                  <span style={{ fontSize: '11px', color: c.divider }}>·</span>
                  <span style={{ fontSize: '11px', color: c.textMuted }}>
                    {TERRITORY_SHORT[capture.thematic_territory] || capture.thematic_territory}
                  </span>
                </>
              )}
            </div>
            <button
              onClick={() =>
                router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(capture.unpacked)}`)
              }
              style={{
                fontSize: '12px',
                color: accentColor,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Develop this →
            </button>
          </div>
        ))
      )}
    </div>
  )

  const threadsCard = continuations.length > 0 ? (
    <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
      <span style={{ ...lbl, marginBottom: '16px' }}>Open Threads</span>
      {continuations.map((cont, idx) => (
        <div
          key={idx}
          onMouseEnter={() => setHoveredThread(idx)}
          onMouseLeave={() => setHoveredThread(null)}
          style={{
            padding: '14px 8px 14px 12px',
            marginLeft: '-12px',
            borderLeft: `2px solid ${hoveredThread === idx ? accentColor : 'transparent'}`,
            borderBottom: idx < continuations.length - 1 ? `1px solid ${c.divider}` : 'none',
            transition: 'border-left-color 0.15s ease',
          }}
        >
          {cont.what_it_opened && (
            <p style={{ fontSize: '13px', color: c.textPrimary, margin: '0 0 8px', lineHeight: 1.5 }}>
              {cont.what_it_opened}
            </p>
          )}
          {cont.natural_continuations.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {cont.natural_continuations.map((next, nIdx) => (
                <li key={nIdx} style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                  <span style={{ color: accentColor, marginRight: '6px' }}>·</span>{next}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  ) : null

  return (
    <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>

      {/* Shell header */}
      <div style={{
        maxWidth: 1200,
        margin: '0 auto',
        width: '100%',
        padding: '28px 28px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <IconButton onClick={() => router.push('/project-board')} ariaLabel="Back to Project Board">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8L10 13" stroke="#e8e6e0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </IconButton>
          <div>
            <h1 style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '22px', fontWeight: 700, color: '#e8e6e0', margin: 0, lineHeight: 1.1 }}>
              Idea Lab
            </h1>
            <p style={{ fontSize: '12px', color: '#6a6866', margin: '3px 0 0' }}>Open week mode</p>
          </div>
        </div>
        <ThemeToggleButton theme={theme} onToggle={toggle} />
      </div>

      {/* Container panel */}
      <div style={{ flex: 1, maxWidth: 1200, margin: '16px auto 0', width: '100%', padding: '0 28px', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          flex: 1,
          backgroundColor: c.containerBg,
          boxShadow: c.containerShadow,
          borderRadius: '28px 28px 0 0',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>

          {/* ── Main grid: Lens + Stage ── */}
          <div className="idea-lab-grid">

            {/* Left — The Lens */}
            <div style={{
              backgroundColor: c.cardBg,
              boxShadow: c.shadow,
              borderRadius: '20px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
            }}>

              {/* Arc */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={lbl}>Arc</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleRandomArcs} style={micro(useRandomArcs)}>Random</button>
                    <button onClick={handleSkipArcs} style={micro(skipArcs)}>Skip</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {(Object.keys(ARC_DEFINITIONS) as Arc[]).map((arc) => (
                    <button
                      key={arc}
                      onClick={() => !useRandomArcs && !skipArcs && toggleArc(arc)}
                      title={ARC_DEFINITIONS[arc]}
                      style={pill(selectedArcs.includes(arc), useRandomArcs || skipArcs)}
                    >
                      {arc}
                    </button>
                  ))}
                </div>
              </div>

              <div style={hdivider} />

              {/* Territory */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={lbl}>Territory</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleRandomTerritories} style={micro(useRandomTerritories)}>Random</button>
                    <button onClick={handleSkipTerritories} style={micro(skipTerritories)}>Skip</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {TERRITORIES.map((t) => (
                    <button
                      key={t}
                      onClick={() => !skipTerritories && !useRandomTerritories && toggleTerritory(t)}
                      title={TERRITORY_LABELS[t]}
                      style={pill(selectedTerritories.includes(t), skipTerritories || useRandomTerritories)}
                    >
                      {TERRITORY_SHORT[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div style={hdivider} />

              {/* Energy */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={lbl}>Energy</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: c.textPrimary }}>
                    {ENERGY_LEVEL_LABELS[energyLevel]}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={4}
                  value={energyIndex}
                  onChange={(e) => setEnergyIndex(Number(e.target.value))}
                  className="idea-lab-range"
                  style={{ width: '100%', display: 'block' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '7px' }}>
                  <span style={{ fontSize: '10px', color: c.textMuted }}>Heavy</span>
                  <span style={{ fontSize: '10px', color: c.textMuted }}>Bright</span>
                </div>
              </div>

              <div style={hdivider} />

              {/* Question Mode */}
              <div>
                <span style={{ ...lbl, marginBottom: '12px' }}>Question Mode</span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  borderRadius: '10px',
                  border: `1px solid ${c.inputBorder}`,
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => setImpersonal(true)}
                    style={{
                      padding: '9px 12px',
                      border: 'none',
                      borderRight: `1px solid ${c.inputBorder}`,
                      backgroundColor: impersonal ? c.textPrimary : 'transparent',
                      color: impersonal ? c.containerBg : c.textMuted,
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Open
                  </button>
                  <button
                    onClick={() => setImpersonal(false)}
                    style={{
                      padding: '9px 12px',
                      border: 'none',
                      backgroundColor: !impersonal ? c.textPrimary : 'transparent',
                      color: !impersonal ? c.containerBg : c.textMuted,
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    Charged
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: c.textMuted, margin: '8px 0 0', lineHeight: 1.45 }}>
                  {impersonal
                    ? 'Spacious — wide, many directions, no single right answer'
                    : 'Direct — positions you as the only authority on the answer'}
                </p>
              </div>

            </div>

            {/* Right — The Stage */}
            <div style={{
              backgroundColor: c.cardBg,
              boxShadow: c.shadow,
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: '500px',
              position: 'relative',
              overflow: 'hidden',
            }}>

              {!generatedPrompt ? (
                /* Empty — expectant state */
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '64px 52px',
                  textAlign: 'center',
                  gap: '32px',
                  position: 'relative',
                }}>
                  {/* Ghost decoration */}
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -55%)',
                      fontSize: '340px',
                      fontWeight: 300,
                      color: c.textPrimary,
                      opacity: 0.04,
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      lineHeight: 1,
                      userSelect: 'none',
                      pointerEvents: 'none',
                      letterSpacing: '-0.05em',
                    }}
                  >?</div>

                  <div style={{ position: 'relative' }}>
                    <p style={{
                      fontSize: '26px',
                      fontWeight: 300,
                      color: c.textPrimary,
                      margin: '0 0 10px',
                      lineHeight: 1.25,
                      letterSpacing: '-0.03em',
                    }}>
                      The question is waiting.
                    </p>
                    <p style={{ fontSize: '14px', color: c.textMuted, margin: 0, lineHeight: 1.5 }}>
                      Configure your lens, then summon it.
                    </p>
                  </div>

                  {error && (
                    <div style={{
                      backgroundColor: 'rgba(239,68,68,0.07)',
                      border: '1px solid rgba(239,68,68,0.18)',
                      borderRadius: '10px',
                      padding: '10px 16px',
                      position: 'relative',
                      maxWidth: '360px',
                      width: '100%',
                    }}>
                      <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', position: 'relative' }}>
                    <button
                      onClick={handleGeneratePrompt}
                      disabled={isGenerateDisabled}
                      style={{
                        padding: '14px 44px',
                        borderRadius: '14px',
                        border: 'none',
                        backgroundColor: isGenerateDisabled ? c.inputBg : accentColor,
                        color: isGenerateDisabled ? c.textMuted : '#ffffff',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: isGenerateDisabled ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s ease',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {isGenerating ? 'Summoning...' : 'Generate a question →'}
                    </button>
                    <button
                      onClick={() => router.push('/idea-lab/conceptualise')}
                      style={{
                        fontSize: '12px',
                        color: c.textMuted,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        textUnderlineOffset: '3px',
                      }}
                    >
                      Or start from scratch
                    </button>
                  </div>
                </div>
              ) : (
                /* Active — the question is here */
                <div style={{ padding: '36px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                    <span style={{ ...lbl, paddingTop: '2px' }}>Your question</span>
                    <button
                      onClick={handleGeneratePrompt}
                      disabled={isGenerating}
                      title="Ask again"
                      style={{
                        flexShrink: 0,
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        border: `1px solid ${c.inputBorder}`,
                        backgroundColor: 'transparent',
                        cursor: isGenerating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: isGenerating ? 0.4 : 0.7,
                        transition: 'opacity 0.15s ease',
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 6a5 5 0 1 0 5-5A5 5 0 0 0 2.1 2.5" stroke={c.textMuted} strokeWidth="1.4" strokeLinecap="round" />
                        <path d="M1 1v3.5H4.5" stroke={c.textMuted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>

                  {/* The prompt — hero */}
                  <p style={{
                    fontSize: '22px',
                    fontWeight: 300,
                    color: c.textPrimary,
                    margin: 0,
                    lineHeight: 1.55,
                    letterSpacing: '-0.02em',
                  }}>
                    {generatedPrompt}
                  </p>

                  <div style={{ height: '1px', backgroundColor: c.divider }} />

                  <div>
                    <span style={{ ...lbl, marginBottom: '10px' }}>Write your response</span>
                    <textarea
                      value={responseText}
                      onChange={(e) => {
                        setResponseText(e.target.value)
                        e.target.style.height = 'auto'
                        e.target.style.height = e.target.scrollHeight + 'px'
                      }}
                      placeholder="Begin here..."
                      rows={5}
                      className="idea-lab-textarea"
                      style={{
                        width: '100%',
                        backgroundColor: c.inputBg,
                        border: `1px solid ${c.inputBorder}`,
                        borderRadius: '12px',
                        padding: '14px 16px',
                        fontSize: '15px',
                        color: c.textPrimary,
                        outline: 'none',
                        resize: 'none',
                        overflowY: 'auto',
                        maxHeight: '35vh',
                        lineHeight: 1.65,
                        boxSizing: 'border-box',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>

                  <button
                    onClick={() => {
                      if (responseText.trim()) {
                        router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(responseText)}`)
                      }
                    }}
                    disabled={!responseText.trim()}
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: 'none',
                      backgroundColor: c.textPrimary,
                      color: c.containerBg,
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: !responseText.trim() ? 'not-allowed' : 'pointer',
                      opacity: !responseText.trim() ? 0.25 : 1,
                      transition: 'opacity 0.15s ease',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Begin conceptualisation →
                  </button>

                </div>
              )}
            </div>

          </div>

          {/* ── The Well: secondary support material ── */}
          {!isLoadingCaptures && (
            continuations.length > 0 ? (
              <div className="idea-lab-well">
                {capturesCard}
                {threadsCard}
              </div>
            ) : (
              capturesCard
            )
          )}

        </div>
      </div>

      <style>{`
        .idea-lab-grid {
          display: grid;
          grid-template-columns: 310px 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 800px) {
          .idea-lab-grid {
            grid-template-columns: 1fr;
          }
        }
        .idea-lab-well {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 800px) {
          .idea-lab-well {
            grid-template-columns: 1fr;
          }
        }
        .idea-lab-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(to right, #3a2520, #a53f2b 50%, #c47010);
          outline: none;
          cursor: pointer;
          width: 100%;
          display: block;
        }
        .idea-lab-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.28);
          border: 2px solid ${accentColor};
        }
        .idea-lab-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #ffffff;
          cursor: pointer;
          border: 2px solid ${accentColor};
          box-shadow: 0 1px 4px rgba(0,0,0,0.28);
        }
        .idea-lab-textarea::placeholder {
          color: ${c.textMuted};
        }
        .idea-lab-textarea:focus {
          border-color: ${accentColor} !important;
        }
      `}</style>
    </div>
  )
}
