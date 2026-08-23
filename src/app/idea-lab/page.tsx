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

const ENERGY_LEVELS = ['heavy', 'low', 'steady', 'light', 'bright'] as const
type EnergyLevel = (typeof ENERGY_LEVELS)[number]
const ENERGY_LEVEL_LABELS: Record<EnergyLevel, string> = {
  heavy: 'Heavy',
  low: 'Low',
  steady: 'Steady',
  light: 'Light',
  bright: 'Bright',
}

const ALIVE_PROMPTS: Record<string, string> = {
  default: 'What feels alive today?',
  random: 'Let chance choose the door.',
  many: 'Several currents are moving — which one is loudest?',
  Breakaway: 'What needs to break away?',
  Beginning: 'What wants to begin?',
  Expansion: 'Where can you grow?',
  Integration: 'What wants to come together?',
  'Beginning,Breakaway': 'What ends so something new can start?',
  'Breakaway,Expansion': 'What friction is asking you to expand?',
  'Breakaway,Integration': 'What dissolution leads to wholeness?',
  'Beginning,Expansion': 'How can this beginning deepen?',
  'Beginning,Integration': 'What new thing wants to become whole?',
  'Expansion,Integration': 'How can growth find its form?',
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
    setUseRandomArcs(!useRandomArcs)
    if (!useRandomArcs) { setSkipArcs(false); setSelectedArcs([]) }
  }

  const handleSkipArcs = () => {
    setSkipArcs(!skipArcs)
    if (!skipArcs) { setUseRandomArcs(false); setSelectedArcs([]) }
  }

  const toggleTerritory = (territory: Territory) => {
    setSelectedTerritories((prev) =>
      prev.includes(territory) ? prev.filter((t) => t !== territory) : [...prev, territory]
    )
  }

  const handleSkipTerritories = () => {
    setSkipTerritories(!skipTerritories)
    if (!skipTerritories) { setUseRandomTerritories(false); setSelectedTerritories([]) }
  }

  const handleRandomTerritories = () => {
    setUseRandomTerritories(!useRandomTerritories)
    if (!useRandomTerritories) { setSkipTerritories(false); setSelectedTerritories([]) }
  }

  const getAlivePrompt = () => {
    if (useRandomArcs) return ALIVE_PROMPTS.random
    if (selectedArcs.length === 0) return ALIVE_PROMPTS.default
    if (selectedArcs.length > 2) return ALIVE_PROMPTS.many
    const key = [...selectedArcs].sort().join(',')
    return ALIVE_PROMPTS[key] || ALIVE_PROMPTS.default
  }

  const handleGeneratePrompt = async () => {
    const arcsProvided = selectedArcs.length > 0 || useRandomArcs
    const territoriesProvided = selectedTerritories.length > 0 || useRandomTerritories

    if (!arcsProvided && !skipArcs) {
      setError('Please select at least one arc, use random, or skip arcs')
      return
    }
    if (skipArcs && !territoriesProvided) {
      setError('Skipping arcs needs a territory to explore — select one or use random')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const payload: {
        arcs?: Arc[] | null
        randomArcs?: boolean
        territories?: Territory[] | null
        randomTerritories?: boolean
        energy?: EnergyLevel
        impersonal?: boolean
      } = { energy: energyLevel, impersonal }

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
        setError('Failed to generate prompt')
      }
    } catch (err) {
      console.error('Prompt generation error:', err)
      setError('Failed to generate prompt. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const isGenerateDisabled = (selectedArcs.length === 0 && !useRandomArcs && !skipArcs) || isGenerating

  const eyebrow = (label: string) => ({
    fontFamily: 'var(--font-geist-sans)' as const,
    fontSize: '11px',
    fontWeight: 600 as const,
    color: c.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin: 0,
  })

  const selectionBtnStyle = (selected: boolean, disabled: boolean): React.CSSProperties => ({
    padding: '14px 16px',
    borderRadius: '14px',
    border: `1px solid ${selected ? c.textPrimary : c.inputBorder}`,
    backgroundColor: selected ? c.textPrimary : c.inputBg,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    textAlign: 'left',
    transition: 'all 0.15s ease',
    width: '100%',
  })

  const controlBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: '8px',
    border: `1px solid ${active ? c.textMuted : c.inputBorder}`,
    backgroundColor: active ? c.inputBg : 'transparent',
    color: active ? c.textPrimary : c.textMuted,
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  })

  return (
    <div style={{ minHeight: '100vh', background: shellBackground, display: 'flex', flexDirection: 'column' }}>

      {/* Shell header — sits directly on the dark shell, no background of its own */}
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', padding: '28px 28px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
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

          {/* Arc Selector */}
          <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={eyebrow('Arc')}>Arc</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRandomArcs} style={controlBtnStyle(useRandomArcs)} title="Randomize arc selection">
                  🎲 Random
                </button>
                <button onClick={handleSkipArcs} style={controlBtnStyle(skipArcs)}>
                  Skip
                </button>
              </div>
            </div>
            {skipArcs && (
              <p style={{ fontSize: '12px', color: c.textMuted, margin: '0 0 14px', fontStyle: 'italic' }}>
                No arc — the prompt will stay purely inside the selected territory, without a directional frame.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {(Object.keys(ARC_DEFINITIONS) as Arc[]).map((arc) => {
                const selected = selectedArcs.includes(arc)
                const disabled = useRandomArcs || skipArcs
                return (
                  <button
                    key={arc}
                    onClick={() => toggleArc(arc)}
                    disabled={disabled}
                    style={selectionBtnStyle(selected, disabled)}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: selected ? c.containerBg : c.textPrimary, display: 'block', marginBottom: '4px' }}>
                      The {arc}
                    </span>
                    <span style={{ fontSize: '11px', color: selected ? (theme === 'light' ? '#a09e98' : '#7a7874') : c.textMuted, display: 'block', lineHeight: 1.4 }}>
                      {ARC_DEFINITIONS[arc]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Territory Selector */}
          <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={eyebrow('Territory')}>Thematic Territory</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleRandomTerritories} style={controlBtnStyle(useRandomTerritories)} title="Randomize territory selection">
                  🎲 Random
                </button>
                <button onClick={handleSkipTerritories} style={controlBtnStyle(skipTerritories)}>
                  Skip
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {TERRITORIES.map((territory) => {
                const selected = selectedTerritories.includes(territory)
                const disabled = skipTerritories || useRandomTerritories
                return (
                  <button
                    key={territory}
                    onClick={() => toggleTerritory(territory)}
                    disabled={disabled}
                    style={selectionBtnStyle(selected, disabled)}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: selected ? c.containerBg : c.textPrimary, display: 'block' }}>
                      {TERRITORY_LABELS[territory]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Energy & Mode */}
          <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Energy slider */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <h2 style={eyebrow('Energy')}>Energy</h2>
                <span style={{ fontSize: '13px', fontWeight: 600, color: c.textPrimary }}>{ENERGY_LEVEL_LABELS[energyLevel]}</span>
              </div>
              <input
                type="range"
                min={0}
                max={ENERGY_LEVELS.length - 1}
                value={energyIndex}
                onChange={(e) => setEnergyIndex(Number(e.target.value))}
                className="idea-lab-range"
                style={{ width: '100%', display: 'block', margin: '0 0 6px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: c.textMuted }}>Heavy</span>
                <span style={{ fontSize: '11px', color: c.textMuted }}>Bright</span>
              </div>
              <p style={{ fontSize: '12px', color: c.textMuted, margin: '10px 0 0', lineHeight: 1.5 }}>
                {impersonal
                  ? 'No personal grounding right now, so this only shapes which end of the territory itself gets explored.'
                  : energyLevel === 'steady'
                    ? 'Prompts draw from your portrait as usual.'
                    : energyLevel === 'heavy' || energyLevel === 'low'
                      ? 'Prompts will help you explore what feels heavy right now, rather than steer you away from it.'
                      : 'Prompts will match this lighter energy instead of defaulting to harder material.'}
              </p>
            </div>

            <div style={{ height: '1px', backgroundColor: c.divider }} />

            {/* Impersonal mode */}
            <div
              onClick={() => setImpersonal(!impersonal)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', cursor: 'pointer' }}
            >
              <div>
                <p style={{ fontSize: '14px', fontWeight: 500, color: c.textPrimary, margin: 0 }}>Impersonal mode</p>
                <p style={{ fontSize: '12px', color: c.textMuted, margin: '3px 0 0', lineHeight: 1.4 }}>
                  No portrait, no active work — just the arc and territory on their own terms
                </p>
              </div>
              <div style={{
                flexShrink: 0,
                width: '36px',
                height: '20px',
                borderRadius: '999px',
                backgroundColor: impersonal ? accentColor : c.divider,
                position: 'relative',
                transition: 'background-color 0.2s ease',
              }}>
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  left: impersonal ? '18px' : '2px',
                  width: '16px',
                  height: '16px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transition: 'left 0.2s ease',
                }} />
              </div>
            </div>
          </div>

          {/* What feels alive + Generate */}
          <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '18px', fontWeight: 300, color: c.textPrimary, margin: 0, lineHeight: 1.5 }}>
              {getAlivePrompt()}
            </p>

            {error && (
              <div style={{ backgroundColor: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: '10px', padding: '10px 12px' }}>
                <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleGeneratePrompt}
                disabled={isGenerateDisabled}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isGenerateDisabled ? 'not-allowed' : 'pointer',
                  opacity: isGenerateDisabled ? 0.4 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                {isGenerating ? 'Generating...' : 'Generate prompt'}
              </button>
              <button
                onClick={() => router.push('/idea-lab/conceptualise')}
                style={{
                  flex: 1,
                  padding: '11px 16px',
                  borderRadius: '12px',
                  border: `1px solid ${c.inputBorder}`,
                  backgroundColor: c.inputBg,
                  color: c.textSecondary,
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Start from scratch
              </button>
            </div>
          </div>

          {/* Generated Prompt */}
          {generatedPrompt && (
            <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <p style={{ ...eyebrow('Prompt'), marginBottom: '10px' }}>Generated prompt</p>
                <p style={{ fontSize: '15px', color: c.textPrimary, lineHeight: 1.65, margin: 0 }}>{generatedPrompt}</p>
              </div>

              <div style={{ height: '1px', backgroundColor: c.divider }} />

              <textarea
                value={responseText}
                onChange={(e) => {
                  setResponseText(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                placeholder="What do you think? Write your response..."
                rows={3}
                className="idea-lab-textarea"
                style={{
                  width: '100%',
                  backgroundColor: c.inputBg,
                  border: `1px solid ${c.inputBorder}`,
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '14px',
                  color: c.textPrimary,
                  outline: 'none',
                  resize: 'none',
                  overflowY: 'auto',
                  maxHeight: '50vh',
                  lineHeight: 1.6,
                  boxSizing: 'border-box',
                }}
              />

              <button
                onClick={() => {
                  if (responseText.trim()) {
                    router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(responseText)}`)
                  }
                }}
                disabled={!responseText.trim()}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: 'none',
                  backgroundColor: c.textPrimary,
                  color: c.containerBg,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: !responseText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !responseText.trim() ? 0.35 : 1,
                  transition: 'opacity 0.15s ease',
                }}
              >
                Begin conceptualisation
              </button>
            </div>
          )}

          {/* Capture Bank */}
          <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
            <div style={{ marginBottom: '16px' }}>
              <h2 style={eyebrow('Captures')}>Capture Bank</h2>
              <p style={{ fontSize: '12px', color: c.textMuted, margin: '4px 0 0' }}>
                {captures.length} {captures.length === 1 ? 'capture' : 'captures'}
              </p>
            </div>

            {isLoadingCaptures ? (
              <p style={{ fontSize: '13px', color: c.textMuted }}>Loading captures...</p>
            ) : captures.length === 0 ? (
              <p style={{ fontSize: '13px', color: c.textMuted }}>
                No captures yet. Start with the{' '}
                <Link href="/collector" style={{ color: accentColor, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  Collector
                </Link>
                .
              </p>
            ) : (
              <div>
                {captures.map((capture, idx) => (
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
                    <p style={{ fontSize: '13px', color: c.textPrimary, margin: '0 0 6px', lineHeight: 1.55 }}>
                      {capture.unpacked}
                    </p>
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: c.textMuted }}>{capture.arc}</span>
                      {capture.thematic_territory && (
                        <>
                          <span style={{ fontSize: '11px', color: c.divider }}>•</span>
                          <span style={{ fontSize: '11px', color: c.textMuted }}>
                            {TERRITORY_LABELS[capture.thematic_territory] || capture.thematic_territory}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(capture.unpacked)}`)}
                      style={{ fontSize: '12px', color: accentColor, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      Develop this →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Open Threads */}
          {continuations.length > 0 && (
            <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '20px', padding: '24px' }}>
              <h2 style={{ ...eyebrow('Threads'), marginBottom: '16px' }}>Open Threads from Past Work</h2>
              <div>
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
                      <p style={{ fontSize: '13px', color: c.textPrimary, margin: '0 0 8px', lineHeight: 1.55 }}>
                        {cont.what_it_opened}
                      </p>
                    )}
                    {cont.natural_continuations.length > 0 && (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {cont.natural_continuations.map((next, nextIdx) => (
                          <li key={nextIdx} style={{ fontSize: '12px', color: c.textMuted, lineHeight: 1.5 }}>
                            <span style={{ color: accentColor, marginRight: '6px' }}>•</span>{next}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`
        .idea-lab-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: ${c.divider};
          outline: none;
          cursor: pointer;
        }
        .idea-lab-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${accentColor};
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        .idea-lab-range::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: ${accentColor};
          cursor: pointer;
          border: none;
          box-shadow: 0 1px 4px rgba(0,0,0,0.25);
        }
        .idea-lab-textarea::placeholder {
          color: ${c.textMuted};
        }
      `}</style>
    </div>
  )
}
