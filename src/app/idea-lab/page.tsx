'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { ModalDialog } from '@/components/ui/modal-dialog'

type Arc = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'

type PredefinedSlot = { type: 'predefined'; key: string }
type CustomSlot    = { type: 'custom'; key: string; label: string; rangeMap?: string; facetSeeds?: string[] }
type TerritorySlot = PredefinedSlot | CustomSlot | null

const MAX_SLOTS = 4

interface Capture {
  id: string
  raw_input: string
  unpacked: string
  arc: string
  thematic_territory: string
  url?: string | null
  created_at: string
}

const ARC_DEFINITIONS: Record<Arc, string> = {
  Breakaway: 'Disruption, stepping away from what no longer serves',
  Beginning: 'Fresh starts, emergence, new possibilities',
  Expansion: 'Growth, deepening, broadening horizons',
  Integration: 'Synthesis, wholeness, bringing it together',
}

// Per-arc accent colors — shown only when selected, telling a story about each direction.
const ARC_ACCENT: Record<Arc, string> = {
  Breakaway:   '#a53f2b', // coral — disruption has heat
  Beginning:   '#2a7a5c', // deep emerald — fresh starts, new life
  Expansion:   '#5f4fa0', // muted indigo — depth, breadth of vision
  Integration: '#8a6820', // warm amber-earth — synthesis, wholeness
}

// Short display labels and accent colors for the 4 predefined territories.
const TERRITORY_SHORT: Record<string, string> = {
  creativity_devotion_curiosity:            'Creativity & Devotion',
  healthy_masculinity_emotional_regulation: 'Healthy Masculinity',
  inner_child_tending_expression:           'Inner Child',
  slow_living_life_in_service:              'Slow Living',
}
const TERRITORY_LABELS: Record<string, string> = {
  creativity_devotion_curiosity:            'Creativity, devotion & curiosity',
  healthy_masculinity_emotional_regulation: 'Healthy masculinity & emotional regulation',
  inner_child_tending_expression:           'Inner child tending & expression',
  slow_living_life_in_service:              'Slow living & life in service',
}
const TERRITORY_ACCENT: Record<string, string> = {
  creativity_devotion_curiosity:            '#a53f2b',
  healthy_masculinity_emotional_regulation: '#2a5f80',
  inner_child_tending_expression:           '#8a6820',
  slow_living_life_in_service:              '#2a7a5c',
}

function slotLabel(s: PredefinedSlot | CustomSlot): string {
  return s.type === 'predefined' ? (TERRITORY_SHORT[s.key] || s.key) : s.label
}
function slotAccent(s: PredefinedSlot | CustomSlot): string {
  return s.type === 'predefined' ? (TERRITORY_ACCENT[s.key] || accentColor) : accentColor
}

const DEFAULT_SLOTS: TerritorySlot[] = [
  { type: 'predefined', key: 'creativity_devotion_curiosity' },
  { type: 'predefined', key: 'healthy_masculinity_emotional_regulation' },
  { type: 'predefined', key: 'inner_child_tending_expression' },
  { type: 'predefined', key: 'slow_living_life_in_service' },
]

const ENERGY_LEVELS = ['heavy', 'low', 'steady', 'light', 'bright'] as const
type EnergyLevel = (typeof ENERGY_LEVELS)[number]
const ENERGY_LEVEL_LABELS: Record<EnergyLevel, string> = {
  heavy: 'Heavy', low: 'Low', steady: 'Steady', light: 'Light', bright: 'Bright',
}

export default function IdeaLabPage() {
  const router = useRouter()
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

  const [selectedArcs, setSelectedArcs] = useState<Arc[]>([])
  const [skipArcs, setSkipArcs] = useState(false)
  const [useRandomArcs, setUseRandomArcs] = useState(false)

  // Territory config — up to MAX_SLOTS slots; null = empty (deletable/addable)
  const [territorySlots, setTerritorySlots] = useState<TerritorySlot[]>(DEFAULT_SLOTS)
  const [isLoadingTerritories, setIsLoadingTerritories] = useState(true)
  const [selectedTerritoryKeys, setSelectedTerritoryKeys] = useState<string[]>([])
  const [skipTerritories, setSkipTerritories] = useState(false)

  // Delete UX
  const [hoveringTerritoryKey, setHoveringTerritoryKey] = useState<string | null>(null)
  const [mobileDeleteKey, setMobileDeleteKey] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  // Add-theme UX
  const [addingInSlot, setAddingInSlot] = useState<number | null>(null)
  const [newThemeInput, setNewThemeInput] = useState('')
  const [generatingMapKey, setGeneratingMapKey] = useState<string | null>(null)

  const [energyIndex, setEnergyIndex] = useState(2)
  const energyLevel = ENERGY_LEVELS[energyIndex]
  const [impersonal, setImpersonal] = useState(true)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null)

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(pointer: coarse)').matches)
  }, [])

  useEffect(() => {
    fetch('/api/idea-lab/captures')
      .then((r) => r.json())
      .then((data) => setCaptures(data.captures || []))
      .catch((err) => console.error('Failed to fetch captures:', err))
      .finally(() => setIsLoadingCaptures(false))
  }, [])

  useEffect(() => {
    fetch('/api/idea-lab/territories')
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data.slots)) setTerritorySlots(data.slots) })
      .catch((err) => console.error('Failed to load territories:', err))
      .finally(() => setIsLoadingTerritories(false))
  }, [])

  const saveTerritoryConfig = (slots: TerritorySlot[]) => {
    fetch('/api/idea-lab/territories', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slots }),
    }).catch((err) => console.error('Failed to save territories:', err))
  }

  // ── Arc handlers ──────────────────────────────────────────────────────────

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

  // ── Territory handlers ────────────────────────────────────────────────────

  const handleTerritoryPillClick = (slot: PredefinedSlot | CustomSlot) => {
    if (skipTerritories) return
    const isSelected = selectedTerritoryKeys.includes(slot.key)

    // Mobile: second tap on a selected pill shows the delete X for 4s
    if (isTouchDevice && isSelected && mobileDeleteKey !== slot.key) {
      setMobileDeleteKey(slot.key)
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = setTimeout(() => setMobileDeleteKey(null), 4000)
      return
    }

    setSelectedTerritoryKeys((prev) =>
      prev.includes(slot.key) ? prev.filter((k) => k !== slot.key) : [...prev, slot.key]
    )
  }

  const handleDeleteTerritory = (index: number) => {
    const slot = territorySlots[index]
    const next = [...territorySlots] as TerritorySlot[]
    next[index] = null
    setTerritorySlots(next)
    if (slot) setSelectedTerritoryKeys((prev) => prev.filter((k) => k !== slot.key))
    setHoveringTerritoryKey(null)
    setMobileDeleteKey(null)
    saveTerritoryConfig(next)
  }

  const handleRandomTerritories = () => {
    const available = territorySlots.filter((s): s is PredefinedSlot | CustomSlot => s != null)
    if (available.length === 0) return
    const count = Math.floor(Math.random() * available.length) + 1
    const shuffled = [...available].sort(() => Math.random() - 0.5)
    setSelectedTerritoryKeys(shuffled.slice(0, count).map((s) => s.key))
    setSkipTerritories(false)
  }

  const handleSkipTerritories = () => {
    const next = !skipTerritories
    setSkipTerritories(next)
    if (next) setSelectedTerritoryKeys([])
  }

  const confirmAddTheme = async (index: number) => {
    const label = newThemeInput.trim()
    if (!label) return

    const key = `custom_${Date.now()}`
    const baseSlot: CustomSlot = { type: 'custom', key, label }
    const next = [...territorySlots] as TerritorySlot[]
    next[index] = baseSlot

    setTerritorySlots(next)
    setAddingInSlot(null)
    setNewThemeInput('')
    saveTerritoryConfig(next)

    // Async: generate rich range map + facet seeds and silently upgrade the slot
    setGeneratingMapKey(key)
    try {
      const res = await fetch('/api/idea-lab/territories/generate-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = await res.json()
      if (data.rangeMap && data.facetSeeds) {
        const enriched: CustomSlot = { ...baseSlot, rangeMap: data.rangeMap, facetSeeds: data.facetSeeds }
        setTerritorySlots((prev) => {
          const updated = [...prev] as TerritorySlot[]
          const idx = updated.findIndex((s) => s?.key === key)
          if (idx !== -1) updated[idx] = enriched
          return updated
        })
        saveTerritoryConfig(
          ((prev: TerritorySlot[]) => {
            const updated = [...prev] as TerritorySlot[]
            const idx = updated.findIndex((s) => s?.key === key)
            if (idx !== -1) updated[idx] = enriched
            return updated
          })(next)
        )
      }
    } catch (err) {
      console.error('Failed to generate range map:', err)
    } finally {
      setGeneratingMapKey(null)
    }
  }

  const handleGeneratePrompt = async () => {
    if (!skipArcs && selectedArcs.length === 0 && !useRandomArcs) {
      setError('Select at least one arc, use random, or skip arcs')
      return
    }
    if (skipArcs && selectedTerritoryKeys.length === 0 && !skipTerritories) {
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

      if (skipTerritories) {
        payload.territories = null
      } else if (selectedTerritoryKeys.length > 0) {
        const selectedSlots = selectedTerritoryKeys
          .map((key) => territorySlots.find((s) => s?.key === key))
          .filter((s): s is PredefinedSlot | CustomSlot => s != null)
        payload.territories = selectedSlots.map((s) =>
          s.type === 'predefined'
            ? s.key
            : {
                key: s.key,
                label: s.label,
                custom: true as const,
                ...(s.rangeMap ? { rangeMap: s.rangeMap } : {}),
                ...(s.facetSeeds ? { facetSeeds: s.facetSeeds } : {}),
              }
        )
      }

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

  // ── Style helpers ──────────────────────────────────────────────────────────

  const eyebrow: React.CSSProperties = {
    fontFamily: 'var(--font-geist-sans)',
    fontSize: '11px',
    fontWeight: 600,
    color: c.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    display: 'block',
    margin: 0,
  }

  // Content pills for arc/territory — each gets its own accent when selected.
  const contentPill = (active: boolean, muted: boolean, activeColor: string): React.CSSProperties => ({
    padding: '7px 14px',
    borderRadius: '999px',
    border: `1px solid ${active ? 'transparent' : c.inputBorder}`,
    backgroundColor: active ? activeColor : 'transparent',
    color: active ? '#fff' : c.textSecondary,
    fontSize: '12px',
    fontWeight: active ? 600 : 400,
    cursor: muted ? 'default' : 'pointer',
    opacity: muted && !active ? 0.35 : 1,
    transition: 'all 0.15s ease',
    lineHeight: 1,
    flexShrink: 0,
  })

  const hdivider: React.CSSProperties = {
    height: '1px',
    backgroundColor: c.divider,
    margin: '20px -24px',
    flexShrink: 0,
  }

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
            <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '11px', fontWeight: 600, color: '#6e6c67', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
              Companheiro
            </p>
            <h1 style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '22px', fontWeight: 700, color: '#e8e6e0', margin: '2px 0 0', lineHeight: 1.1 }}>
              Idea Lab
            </h1>
          </div>
        </div>
        <ThemeToggleButton theme={theme} onToggle={toggle} />
      </div>

      {/* Container panel */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          flex: 1,
          maxWidth: 1200,
          margin: '16px auto 0',
          width: '100%',
          padding: '0 28px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{
          flex: 1,
          backgroundColor: c.containerBg,
          boxShadow: c.containerShadow,
          borderRadius: '28px 28px 0 0',
          padding: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          transition: 'background-color 0.3s ease',
        }}>

          {/* ── Main grid: Lens + Stage ── */}
          <div className="idea-lab-grid">

            {/* Left — The Lens */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.08, ease: 'easeOut' }}
              style={{
                backgroundColor: c.cardBg,
                boxShadow: c.shadow,
                borderRadius: '22px',
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                transition: 'background-color 0.3s ease',
              }}
            >

              {/* Arc */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={eyebrow}>Arc</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Random/Skip: no border, text-style, standard hover */}
                    <motion.button
                      onClick={handleRandomArcs}
                      whileHover={{ opacity: 0.65 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '3px 0',
                        color: useRandomArcs ? c.textPrimary : c.textMuted,
                        fontSize: '11px',
                        fontWeight: useRandomArcs ? 600 : 400,
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Random
                    </motion.button>
                    <span style={{ color: c.divider, fontSize: '11px', alignSelf: 'center' }}>·</span>
                    <motion.button
                      onClick={handleSkipArcs}
                      whileHover={{ opacity: 0.65 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '3px 0',
                        color: skipArcs ? c.textPrimary : c.textMuted,
                        fontSize: '11px',
                        fontWeight: skipArcs ? 600 : 400,
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                      }}
                    >
                      Skip
                    </motion.button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                  {(Object.keys(ARC_DEFINITIONS) as Arc[]).map((arc) => (
                    <button
                      key={arc}
                      onClick={() => !useRandomArcs && !skipArcs && toggleArc(arc)}
                      title={ARC_DEFINITIONS[arc]}
                      style={contentPill(selectedArcs.includes(arc), useRandomArcs || skipArcs, ARC_ACCENT[arc])}
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
                  <span style={eyebrow}>Territory</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <motion.button
                      onClick={handleRandomTerritories}
                      whileHover={{ opacity: 0.65 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background: 'none', border: 'none', padding: '3px 0',
                        color: c.textMuted, fontSize: '11px', fontWeight: 400,
                        cursor: 'pointer', letterSpacing: '0.01em',
                      }}
                    >
                      Random
                    </motion.button>
                    <span style={{ color: c.divider, fontSize: '11px', alignSelf: 'center' }}>·</span>
                    <motion.button
                      onClick={handleSkipTerritories}
                      whileHover={{ opacity: 0.65 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background: 'none', border: 'none', padding: '3px 0',
                        color: skipTerritories ? c.textPrimary : c.textMuted,
                        fontSize: '11px', fontWeight: skipTerritories ? 600 : 400,
                        cursor: 'pointer', letterSpacing: '0.01em',
                      }}
                    >
                      Skip
                    </motion.button>
                  </div>
                </div>

                {!isLoadingTerritories && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                    {Array.from({ length: MAX_SLOTS }).map((_, index) => {
                      const slot = territorySlots[index] ?? null

                      // ── Filled slot ───────────────────────────────────────
                      if (slot) {
                        const isSelected = selectedTerritoryKeys.includes(slot.key)
                        const showX = hoveringTerritoryKey === slot.key || mobileDeleteKey === slot.key
                        return (
                          <div
                            key={slot.key}
                            style={{ position: 'relative', display: 'inline-flex' }}
                            onMouseEnter={() => !isTouchDevice && setHoveringTerritoryKey(slot.key)}
                            onMouseLeave={() => !isTouchDevice && setHoveringTerritoryKey(null)}
                          >
                            <button
                              onClick={() => handleTerritoryPillClick(slot)}
                              title={slot.type === 'predefined' ? (TERRITORY_LABELS[slot.key] || slot.key) : slot.label}
                              style={contentPill(isSelected, skipTerritories, slotAccent(slot))}
                            >
                              {slotLabel(slot)}
                              {generatingMapKey === slot.key && (
                                <span style={{ marginLeft: '5px', opacity: 0.5, fontSize: '10px' }}>·</span>
                              )}
                            </button>
                            <AnimatePresence>
                              {showX && (
                                <motion.button
                                  key="x"
                                  initial={{ opacity: 0, scale: 0.6 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.6 }}
                                  transition={{ duration: 0.12 }}
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTerritory(index) }}
                                  aria-label={`Remove ${slotLabel(slot)}`}
                                  style={{
                                    position: 'absolute', top: -6, right: -6,
                                    width: 16, height: 16, borderRadius: '50%',
                                    background: c.textPrimary, color: c.containerBg,
                                    border: 'none', cursor: 'pointer', padding: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '8px', fontWeight: 700, lineHeight: 1, zIndex: 10,
                                  }}
                                >
                                  ✕
                                </motion.button>
                              )}
                            </AnimatePresence>
                          </div>
                        )
                      }

                      // ── Empty slot — input active ─────────────────────────
                      if (addingInSlot === index) {
                        return (
                          <input
                            key={`adding-${index}`}
                            autoFocus
                            value={newThemeInput}
                            onChange={(e) => setNewThemeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newThemeInput.trim()) confirmAddTheme(index)
                              if (e.key === 'Escape') { setAddingInSlot(null); setNewThemeInput('') }
                            }}
                            onBlur={() => { setAddingInSlot(null); setNewThemeInput('') }}
                            placeholder="Theme name..."
                            style={{
                              padding: '6px 13px', borderRadius: '999px',
                              border: `1px solid ${accentColor}`,
                              background: c.inputBg, color: c.textPrimary,
                              fontSize: '12px', outline: 'none', lineHeight: 1,
                              width: '130px', flexShrink: 0,
                            }}
                          />
                        )
                      }

                      // ── Empty slot — placeholder pill ─────────────────────
                      return (
                        <button
                          key={`empty-${index}`}
                          onClick={() => { setAddingInSlot(index); setNewThemeInput('') }}
                          className="idea-lab-empty-pill"
                          style={{
                            padding: '7px 14px', borderRadius: '999px',
                            border: `1.5px dashed ${c.textMuted}`,
                            backgroundColor: 'transparent', color: c.textMuted,
                            fontSize: '12px', fontWeight: 400, cursor: 'pointer',
                            opacity: 0.45, lineHeight: 1, flexShrink: 0,
                            transition: 'opacity 0.15s ease',
                          }}
                        >
                          + Add theme
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div style={hdivider} />

              {/* Energy */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <span style={eyebrow}>Energy</span>
                  <span style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '12px', fontWeight: 600, color: c.textPrimary }}>
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
                <span style={{ ...eyebrow, marginBottom: '12px' }}>Question Mode</span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  borderRadius: '11px',
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
                      fontFamily: 'var(--font-geist-sans)',
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
                      fontFamily: 'var(--font-geist-sans)',
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

            </motion.div>

            {/* Right — The Stage */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.14, ease: 'easeOut' }}
              style={{
                backgroundColor: c.cardBg,
                boxShadow: c.shadow,
                borderRadius: '22px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                transition: 'background-color 0.3s ease',
              }}
            >
              <AnimatePresence mode="wait">
                {!generatedPrompt ? (
                  /* Empty — expectant */
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '64px 52px',
                      textAlign: 'center',
                      gap: '32px',
                    }}
                  >
                    <div>
                      <p style={{
                        fontFamily: 'var(--font-geist-sans)',
                        fontSize: '26px',
                        fontWeight: 500,
                        color: c.textPrimary,
                        margin: '0 0 10px',
                        lineHeight: 1.25,
                        letterSpacing: '-0.03em',
                      }}>
                        The question is waiting.
                      </p>
                      <p style={{
                        fontFamily: 'var(--font-geist-sans)',
                        fontSize: '14px',
                        color: c.textMuted,
                        margin: 0,
                        lineHeight: 1.5,
                      }}>
                        Configure your lens, then summon it.
                      </p>
                    </div>

                    {error && (
                      <div style={{
                        backgroundColor: 'rgba(239,68,68,0.07)',
                        border: '1px solid rgba(239,68,68,0.18)',
                        borderRadius: '10px',
                        padding: '10px 16px',
                        maxWidth: '340px',
                        width: '100%',
                      }}>
                        <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{error}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                      <motion.button
                        onClick={handleGeneratePrompt}
                        disabled={isGenerateDisabled}
                        whileHover={isGenerateDisabled ? {} : { opacity: 0.85 }}
                        whileTap={isGenerateDisabled ? {} : { scale: 0.97 }}
                        style={{
                          padding: '14px 44px',
                          borderRadius: '14px',
                          border: 'none',
                          backgroundColor: isGenerateDisabled ? c.inputBg : accentColor,
                          color: isGenerateDisabled ? c.textMuted : '#ffffff',
                          fontFamily: 'var(--font-geist-sans)',
                          fontSize: '15px',
                          fontWeight: 600,
                          cursor: isGenerateDisabled ? 'not-allowed' : 'pointer',
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {isGenerating ? 'Summoning...' : 'Generate a question →'}
                      </motion.button>
                      <motion.button
                        onClick={() => router.push('/idea-lab/conceptualise')}
                        whileHover={{ opacity: 0.65 }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                          fontFamily: 'var(--font-geist-sans)',
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
                      </motion.button>
                    </div>
                  </motion.div>
                ) : (
                  /* Active — the question is here */
                  <motion.div
                    key="active"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    style={{ padding: '36px', display: 'flex', flexDirection: 'column', gap: '28px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                      <span style={{ ...eyebrow, paddingTop: '2px' }}>Your question</span>
                      {/* Legible text button — no longer a tiny icon */}
                      <motion.button
                        onClick={handleGeneratePrompt}
                        disabled={isGenerating}
                        whileHover={isGenerating ? {} : { opacity: 0.65 }}
                        whileTap={isGenerating ? {} : { scale: 0.96 }}
                        style={{
                          flexShrink: 0,
                          padding: '5px 12px',
                          borderRadius: '999px',
                          border: `1px solid ${c.inputBorder}`,
                          backgroundColor: 'transparent',
                          color: c.textMuted,
                          fontFamily: 'var(--font-geist-sans)',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: isGenerating ? 'not-allowed' : 'pointer',
                          opacity: isGenerating ? 0.4 : 1,
                          letterSpacing: '0.01em',
                        }}
                      >
                        {isGenerating ? 'Asking...' : 'Ask again'}
                      </motion.button>
                    </div>

                    <p style={{
                      fontFamily: 'var(--font-geist-sans)',
                      fontSize: '22px',
                      fontWeight: 500,
                      color: c.textPrimary,
                      margin: 0,
                      lineHeight: 1.5,
                      letterSpacing: '-0.025em',
                    }}>
                      {generatedPrompt}
                    </p>

                    <div style={{ height: '1px', backgroundColor: c.divider }} />

                    <div>
                      <span style={{ ...eyebrow, marginBottom: '10px' }}>Write your response</span>
                      <textarea
                        value={responseText}
                        onChange={(e) => {
                          setResponseText(e.target.value)
                          e.target.style.height = 'auto'
                          e.target.style.height = e.target.scrollHeight + 'px'
                        }}
                        placeholder="Begin here..."
                        rows={1}
                        className="idea-lab-textarea"
                        style={{
                          width: '100%',
                          backgroundColor: c.inputBg,
                          border: `1px solid ${c.inputBorder}`,
                          borderRadius: '12px',
                          padding: '14px 16px',
                          fontFamily: 'var(--font-geist-sans)',
                          fontSize: '15px',
                          color: c.textPrimary,
                          outline: 'none',
                          resize: 'none',
                          overflowY: 'auto',
                          maxHeight: '140px',
                          lineHeight: 1.65,
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <button
                      onClick={() => {
                        if (responseText.trim()) {
                          const params = new URLSearchParams({ seed: responseText })
                          if (generatedPrompt) params.set('question', generatedPrompt)
                          router.push(`/idea-lab/conceptualise?${params.toString()}`)
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
                        fontFamily: 'var(--font-geist-sans)',
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
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

          </div>

          {/* ── The Well: Capture Bank as horizontal carousel ── */}
          {!isLoadingCaptures && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2, ease: 'easeOut' }}
              style={{
                backgroundColor: c.cardBg,
                boxShadow: c.shadow,
                borderRadius: '22px',
                padding: '24px',
                transition: 'background-color 0.3s ease',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px' }}>
                <span style={eyebrow}>Capture Bank</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Link
                    href="/collector"
                    style={{
                      fontFamily: 'var(--font-geist-sans)',
                      fontSize: '11px',
                      color: accentColor,
                      textDecoration: 'none',
                      letterSpacing: '0.01em',
                    }}
                  >
                    Open Collector →
                  </Link>
                  <span style={{ fontSize: '11px', color: c.textMuted }}>
                    {captures.length} {captures.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </div>

              {captures.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-geist-sans)', fontSize: '13px', color: c.textMuted, lineHeight: 1.5, margin: 0 }}>
                  No captures yet.{' '}
                  <Link href="/collector" style={{ color: accentColor, textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                    Start with Collector →
                  </Link>
                </p>
              ) : (
                /* Horizontal carousel — 3 visible + 4th fades out */
                <div style={{ position: 'relative' }}>
                  <div className="idea-lab-carousel">
                    {captures.map((capture) => (
                      <motion.div
                        key={capture.id}
                        className="idea-lab-carousel-card"
                        onClick={() => setSelectedCapture(capture)}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        style={{
                          backgroundColor: c.cardBgInner,
                          borderRadius: '14px',
                          padding: '16px 18px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                          flexShrink: 0,
                          cursor: 'pointer',
                        }}
                      >
                        <p style={{
                          fontFamily: 'var(--font-geist-sans)',
                          fontSize: '13px',
                          color: c.textPrimary,
                          margin: 0,
                          lineHeight: 1.55,
                          display: '-webkit-box',
                          WebkitLineClamp: 4,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {capture.raw_input}
                        </p>
                        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {capture.arc && (
                              <span style={{ fontSize: '10px', color: c.textMuted, fontFamily: 'var(--font-geist-sans)' }}>
                                {capture.arc}
                              </span>
                            )}
                            {capture.arc && capture.thematic_territory && (
                              <span style={{ fontSize: '10px', color: c.divider }}>·</span>
                            )}
                            {capture.thematic_territory && (
                              <span style={{ fontSize: '10px', color: c.textMuted, fontFamily: 'var(--font-geist-sans)' }}>
                                {TERRITORY_SHORT[capture.thematic_territory] || capture.thematic_territory}
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(capture.unpacked)}`)
                            }}
                            style={{
                              fontFamily: 'var(--font-geist-sans)',
                              fontSize: '12px',
                              color: accentColor,
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              textAlign: 'left',
                            }}
                          >
                            Develop this →
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Fade overlay — only shown when there are more than 3 captures */}
                  {captures.length > 3 && (
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        bottom: 0,
                        width: '120px',
                        background: `linear-gradient(to right, transparent, ${c.cardBg})`,
                        pointerEvents: 'none',
                        borderRadius: '0 14px 14px 0',
                      }}
                    />
                  )}
                </div>
              )}
            </motion.div>
          )}

        </div>
      </motion.div>

      <style>{`
        .idea-lab-grid {
          display: grid;
          grid-template-columns: 310px 1fr;
          gap: 16px;
          align-items: stretch;
        }
        @media (max-width: 800px) {
          .idea-lab-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Horizontal carousel — exactly 3 cards visible, scroll for more */
        .idea-lab-carousel {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          padding-bottom: 2px;
        }
        .idea-lab-carousel::-webkit-scrollbar {
          display: none;
        }
        /* flex: 0 0 <basis> is the reliable way to fix card width in an
           overflowing flex container — percentage on min-width resolves
           differently and stretches when few items are present. */
        .idea-lab-carousel-card {
          flex: 0 0 calc(33.33% - 8px);
          min-width: 0;
          scroll-snap-align: start;
        }
        @media (max-width: 800px) {
          .idea-lab-carousel-card {
            flex: 0 0 calc(66.66% - 6px);
          }
        }

        /* Energy slider — warm palette: muted dark → coral → soft rose */
        .idea-lab-range {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 999px;
          background: linear-gradient(to right, #3a2520, ${accentColor} 50%, #d4907a);
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
        .idea-lab-empty-pill:hover {
          opacity: 0.7 !important;
        }
        .idea-lab-textarea::placeholder {
          color: ${c.textMuted};
        }
        .idea-lab-textarea:focus {
          border-color: ${accentColor} !important;
        }
      `}</style>

      {/* Capture detail modal */}
      {selectedCapture && (
        <ModalDialog
          theme={theme}
          onClose={() => setSelectedCapture(null)}
          title="Capture"
          subtitle={
            <>
              {selectedCapture.arc && <span>{selectedCapture.arc}</span>}
              {selectedCapture.arc && selectedCapture.thematic_territory && <span>·</span>}
              {selectedCapture.thematic_territory && (
                <span>{TERRITORY_SHORT[selectedCapture.thematic_territory] || selectedCapture.thematic_territory}</span>
              )}
            </>
          }
          footer={
            <motion.button
              onClick={() =>
                router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(selectedCapture.unpacked)}`)
              }
              whileHover={{ opacity: 0.82 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: accentColor,
                color: '#ffffff',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Develop this →
            </motion.button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {selectedCapture.raw_input && (
              <div>
                <p style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: c.textSecondary,
                  margin: '0 0 8px',
                }}>What I captured</p>
                <p style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '15px',
                  color: c.textPrimary,
                  lineHeight: 1.65,
                  margin: 0,
                }}>
                  {selectedCapture.raw_input}
                </p>
              </div>
            )}

            {selectedCapture.url && (
              <div style={{ paddingTop: '12px', borderTop: `1px solid ${c.divider}` }}>
                <p style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: c.textSecondary,
                  margin: '0 0 6px',
                }}>Source</p>
                <a
                  href={selectedCapture.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-geist-sans)',
                    fontSize: '13px',
                    color: accentColor,
                    wordBreak: 'break-all',
                  }}
                >
                  {selectedCapture.url}
                </a>
              </div>
            )}

            {selectedCapture.unpacked && (
              <div style={{ paddingTop: '12px', borderTop: `1px solid ${c.divider}` }}>
                <p style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: c.textSecondary,
                  margin: '0 0 8px',
                }}>Analysis</p>
                <p style={{
                  fontFamily: 'var(--font-geist-sans)',
                  fontSize: '14px',
                  color: c.textSecondary,
                  lineHeight: 1.65,
                  margin: 0,
                }}>
                  {selectedCapture.unpacked}
                </p>
              </div>
            )}
          </div>
        </ModalDialog>
      )}
    </div>
  )
}
