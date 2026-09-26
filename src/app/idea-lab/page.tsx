'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { joinText } from '@/lib/dictation-text'
import { MicButton } from '@/components/ui/mic-button'
import Link from 'next/link'
import { motion as m, AnimatePresence } from 'motion/react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { PrimaryButton, QuietButton, GhostButton } from '@/components/ui/buttons'
import { TextArea } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { UnderlineLink } from '@/components/ui/underline-link'
import { useTerritories } from '@/hooks/useTerritories'
import { alpha, arcHue, radius, shell, type as typeRoles, type Arc } from '@/lib/design-tokens'
import { customKey, isFilled, MAX_TERRITORY_SLOTS, slotShort, slotLabel, type CustomSlot, type FilledSlot, type TerritorySlot } from '@/lib/territories'

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

const ENERGY_LEVELS = ['heavy', 'low', 'steady', 'light', 'bright'] as const
type EnergyLevel = (typeof ENERGY_LEVELS)[number]
const ENERGY_LEVEL_LABELS: Record<EnergyLevel, string> = { heavy: 'Heavy', low: 'Low', steady: 'Steady', light: 'Light', bright: 'Bright' }

export default function IdeaLabPage() {
  const router = useRouter()
  const { t } = useTheme()
  const territories = useTerritories()
  const { slots: territorySlots, loaded: territoriesLoaded, save: saveTerritoryConfig } = territories

  const [selectedArcs, setSelectedArcs] = useState<Arc[]>([])
  const [skipArcs, setSkipArcs] = useState(false)
  const [useRandomArcs, setUseRandomArcs] = useState(false)

  const [selectedTerritoryKeys, setSelectedTerritoryKeys] = useState<string[]>([])
  const [skipTerritories, setSkipTerritories] = useState(false)

  const [hoveringTerritoryKey, setHoveringTerritoryKey] = useState<string | null>(null)
  const [mobileDeleteKey, setMobileDeleteKey] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

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

  // The mask over the lens + stage: bring an idea you already have (straight
  // into the conversation), or summon one (the lens and question below).
  const [entry, setEntry] = useState<'choosing' | 'bring' | 'summon'>('choosing')
  const [bringText, setBringText] = useState('')
  const bringTextRef = useRef('')
  bringTextRef.current = bringText
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

  // ── Arc handlers ──────────────────────────────────────────────────────────
  const toggleArc = (arc: Arc) => setSelectedArcs((prev) => (prev.includes(arc) ? prev.filter((a) => a !== arc) : [...prev, arc]))
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
  const handleTerritoryPillClick = (slot: FilledSlot) => {
    if (skipTerritories) return
    const isSelected = selectedTerritoryKeys.includes(slot.key)
    if (isTouchDevice && isSelected && mobileDeleteKey !== slot.key) {
      setMobileDeleteKey(slot.key)
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      deleteTimerRef.current = setTimeout(() => setMobileDeleteKey(null), 4000)
      return
    }
    setSelectedTerritoryKeys((prev) => (prev.includes(slot.key) ? prev.filter((k) => k !== slot.key) : [...prev, slot.key]))
  }

  const handleDeleteTerritory = (index: number) => {
    const slot = territorySlots[index]
    const next = [...territorySlots] as TerritorySlot[]
    next[index] = null
    if (slot) setSelectedTerritoryKeys((prev) => prev.filter((k) => k !== slot.key))
    setHoveringTerritoryKey(null)
    setMobileDeleteKey(null)
    saveTerritoryConfig(next)
  }

  const handleRandomTerritories = () => {
    const available = territorySlots.filter(isFilled)
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
    const key = customKey(label)
    const baseSlot: CustomSlot = { type: 'custom', key, label }
    const next = [...territorySlots] as TerritorySlot[]
    next[index] = baseSlot
    setAddingInSlot(null)
    setNewThemeInput('')
    saveTerritoryConfig(next)

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
        const updated = [...next] as TerritorySlot[]
        const idx = updated.findIndex((s) => s?.key === key)
        if (idx !== -1) updated[idx] = enriched
        saveTerritoryConfig(updated)
      }
    } catch (err) {
      console.error('Failed to generate range map:', err)
    } finally {
      setGeneratingMapKey(null)
    }
  }

  const handleGeneratePrompt = async () => {
    if (!skipArcs && selectedArcs.length === 0 && !useRandomArcs) {
      setError('Select at least one movement, use random, or skip')
      return
    }
    if (skipArcs && selectedTerritoryKeys.length === 0 && !skipTerritories) {
      setError('Skipping movements needs a territory — select one or use random')
      return
    }
    setIsGenerating(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { energy: energyLevel, impersonal }
      if (generatedPrompt) payload.previousPrompt = generatedPrompt
      if (skipArcs) payload.arcs = null
      else if (useRandomArcs) payload.randomArcs = true
      else payload.arcs = selectedArcs

      if (skipTerritories) {
        payload.territories = null
      } else if (selectedTerritoryKeys.length > 0) {
        const selectedSlots = selectedTerritoryKeys.map((key) => territorySlots.find((s) => s?.key === key) ?? null).filter(isFilled)
        payload.territories = selectedSlots.map((s) =>
          s.type === 'predefined'
            ? s.key
            : { key: s.key, label: s.label, custom: true as const, ...(s.rangeMap ? { rangeMap: s.rangeMap } : {}), ...(s.facetSeeds ? { facetSeeds: s.facetSeeds } : {}) }
        )
      }

      const res = await fetch('/api/idea-lab/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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

  const isGenerateDisabled = (!skipArcs && selectedArcs.length === 0 && !useRandomArcs) || isGenerating

  // ── Bring an idea: one text box, two exits ────────────────────────────────
  const { isRecording: isBringRecording, interimText: bringInterim, handleRecordToggle: toggleBringRecording, clearInterim: clearBringInterim, finish: finishBringDictation } = useDictation({
    onAppend: useCallback((text: string) => {
      setBringText((prev) => prev + (prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : '') + text)
    }, []),
    getContext: () => bringTextRef.current.slice(-80),
  })

  // What the box shows, including dictation still being punctuated — the
  // source of truth for both exits, so a click never sees an empty idea.
  const bringShown = bringText + (bringInterim ? (bringText && !bringText.endsWith(' ') && !bringText.endsWith('\n') ? ' ' : '') + bringInterim : '')

  const leaveBring = () => {
    finishBringDictation()
    setEntry('choosing')
  }

  // Stop the mic and fold whatever it was still punctuating into the box,
  // so the idea is whole (and still there if the next step fails).
  const takeBringText = () => {
    const text = joinText(bringText, finishBringDictation()).trim()
    setBringText(text)
    return text
  }

  // Not settled yet: talk it through, opening with what they wrote.
  const talkItThrough = () => {
    if (!bringShown.trim()) return
    const text = takeBringText()
    sessionStorage.setItem('brought_opening', text)
    router.push('/idea-lab/conceptualise?mode=bring')
  }

  // Already clear in their mind: no conversation, no concept document.
  // Straight into writing; the core concept can be built later from the board.
  const [isStarting, setIsStarting] = useState(false)
  const skipToWriting = async () => {
    if (isStarting) return
    const text = takeBringText()
    setIsStarting(true)
    setError(null)
    try {
      const res = await fetch('/api/idea-lab/quick-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      const data = await res.json()
      if (data.success) { router.push(`/p/${data.project_id}`); return }
      setError(data.error || `Could not start the project (${res.status})`)
    } catch {
      setError('Could not start the project')
    }
    setIsStarting(false)
  }



  const textLink = (onClick: () => void, label: string, active = false) => (
    <button onClick={onClick} style={{ background: 'none', border: 'none', padding: '3px 0', color: active ? t.textPrimary : t.textMuted, ...typeRoles.small, fontSize: 11, fontWeight: active ? 600 : 400, cursor: 'pointer' }}>
      {label}
    </button>
  )

  return (
    <PageShell mood="ember">
      <style>{`
        .idea-lab-grid { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: stretch; }
        @media (max-width: 800px) { .idea-lab-grid { grid-template-columns: 1fr; } }
        .idea-lab-carousel { display: flex; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; padding-bottom: 2px; }
        .idea-lab-carousel::-webkit-scrollbar { display: none; }
        .idea-lab-carousel-card { flex: 0 0 calc(33.33% - 8px); min-width: 0; scroll-snap-align: start; }
        @media (max-width: 800px) { .idea-lab-carousel-card { flex: 0 0 calc(72% - 6px); } }
        .idea-lab-entry { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; width: 100%; max-width: 620px; }
        @media (max-width: 640px) { .idea-lab-entry { grid-template-columns: 1fr; } }
        .idea-lab-range { -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: linear-gradient(to right, ${t.violet}, ${t.ochre} 50%, ${t.verdant}); outline: none; cursor: pointer; width: 100%; display: block; }
        .idea-lab-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: ${t.cardBg}; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.28); border: 2px solid ${t.textPrimary}; }
        .idea-lab-range::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: ${t.cardBg}; cursor: pointer; border: 2px solid ${t.textPrimary}; box-shadow: 0 1px 4px rgba(0,0,0,0.28); }
      `}</style>

      <PageHeader eyebrow="Companheiro" title="Idea Lab" subtitle="Bring an idea you already carry, or summon a new one." />

      <Container>
        <div style={{ position: 'relative' }}>
        <AnimatePresence>
          {entry !== 'summon' && (
            <m.div
              key="entry-mask"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'absolute', inset: -8, zIndex: 20, borderRadius: radius.card,
                background: alpha(shell.ink, 0.62), backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'clamp(40px, 10vh, 96px) 16px 32px', gap: 28, textAlign: 'center',
              }}
            >
              {entry === 'choosing' ? (
                <>
                  <div>
                    <p style={{ ...typeRoles.h2, fontSize: 'clamp(22px, 3.4vw, 28px)', color: shell.text, marginBottom: 10 }}>Where are you starting from?</p>
                    <p style={{ ...typeRoles.ui, fontSize: 14, color: shell.muted }}>Either way, you&apos;ll end with a core concept.</p>
                  </div>
                  <div className="idea-lab-entry">
                    {[
                      { key: 'bring', eyebrow: 'I have one', title: 'Bring an idea', body: 'Something you’ve been carrying. Talk it through, or go straight to writing if it’s already clear.', onClick: () => setEntry('bring') },
                      { key: 'summon', eyebrow: 'I need one', title: 'Summon an idea', body: 'Set a lens (movement, territory, energy) and get a question to start from.', onClick: () => setEntry('summon') },
                    ].map((o) => (
                      <m.button
                        key={o.key}
                        type="button"
                        onClick={o.onClick}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.99 }}
                        style={{ textAlign: 'left', background: t.cardBg, color: t.textPrimary, border: 'none', borderRadius: radius.card, boxShadow: t.shadow, padding: '22px 22px 20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
                      >
                        <Eyebrow style={{ color: t.ember }}>{o.eyebrow}</Eyebrow>
                        <span style={{ ...typeRoles.h2, fontSize: 20, color: t.textPrimary }}>{o.title} →</span>
                        <span style={{ ...typeRoles.small, color: t.textMuted }}>{o.body}</span>
                      </m.button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ width: '100%', maxWidth: 620, textAlign: 'left', background: t.cardBg, borderRadius: radius.card, boxShadow: t.shadow, padding: 'clamp(20px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                    <div>
                      <Eyebrow style={{ marginBottom: 6, color: t.ember }}>Bring an idea</Eyebrow>
                      <p style={{ ...typeRoles.small, color: t.textMuted }}>Say what you already know: the angle, the feeling, who it&apos;s for, what&apos;s still loose.</p>
                    </div>
                    <GhostButton size="sm" onClick={leaveBring}>Back</GhostButton>
                  </div>
                  <TextArea
                    autoFocus
                    voice
                    value={bringShown}
                    onChange={(v) => { clearBringInterim(); setBringText(v) }}
                    onKeyDown={(e) => { if (e.key === 'Escape') leaveBring() }}
                    placeholder="Write freely…"
                    ariaLabel="Your idea"
                    minRows={6}
                    maxHeight={360}
                    style={{ fontSize: 15, lineHeight: 1.7, padding: '14px 16px', borderRadius: radius.widget }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <MicButton recording={isBringRecording} onToggle={toggleBringRecording} size={44} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <PrimaryButton onClick={talkItThrough} disabled={!bringShown.trim() || isStarting} full size="lg">Talk it through →</PrimaryButton>
                    </div>
                  </div>
                  <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, textAlign: 'center' }}>
                    Already clear in your head?{' '}
                    <UnderlineLink onClick={skipToWriting} color={t.ember}>{isStarting ? 'Starting…' : 'Skip straight to writing'}</UnderlineLink>
                  </p>
                  {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, textAlign: 'center' }}>{error}</p>}
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>
        <div className="idea-lab-grid" inert={entry !== 'summon'} aria-hidden={entry !== 'summon'}>
          {/* ── The Lens ── */}
          <Card padding={24} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Eyebrow>Movement</Eyebrow>
                <div style={{ display: 'flex', gap: 10 }}>
                  {textLink(handleRandomArcs, 'Random', useRandomArcs)}
                  {textLink(handleSkipArcs, 'Skip', skipArcs)}
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, opacity: useRandomArcs || skipArcs ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                {(Object.keys(ARC_DEFINITIONS) as Arc[]).map((arc) => (
                  <span key={arc} title={ARC_DEFINITIONS[arc]}>
                    <Pill hue={arcHue[arc]} selected={selectedArcs.includes(arc)} onClick={() => !useRandomArcs && !skipArcs && toggleArc(arc)} size="md">
                      {arc}
                    </Pill>
                  </span>
                ))}
              </div>
            </div>

            <Divider />

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Eyebrow>Territory</Eyebrow>
                <div style={{ display: 'flex', gap: 10 }}>
                  {textLink(handleRandomTerritories, 'Random')}
                  {textLink(handleSkipTerritories, 'Skip', skipTerritories)}
                </div>
              </div>
              {territoriesLoaded && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', opacity: skipTerritories ? 0.4 : 1, transition: 'opacity 0.15s' }}>
                  {territorySlots.map((slot, index) => {
                    if (!slot) return null
                    const isSelected = selectedTerritoryKeys.includes(slot.key)
                    const showX = hoveringTerritoryKey === slot.key || mobileDeleteKey === slot.key
                    return (
                      <div key={slot.key} style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => !isTouchDevice && setHoveringTerritoryKey(slot.key)} onMouseLeave={() => !isTouchDevice && setHoveringTerritoryKey(null)}>
                        <span title={slotLabel(slot)}>
                          <Pill hue={territories.hue(slot.key)} selected={isSelected} onClick={() => handleTerritoryPillClick(slot)} size="md">
                            {slotShort(slot)}
                            {generatingMapKey === slot.key && <span style={{ opacity: 0.6 }}>·</span>}
                          </Pill>
                        </span>
                        <AnimatePresence>
                          {showX && (
                            <m.button
                              key="x"
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ duration: 0.12 }}
                              onClick={(e) => { e.stopPropagation(); handleDeleteTerritory(index) }}
                              aria-label={`Remove ${slotShort(slot)}`}
                              style={{ position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%', background: t.inverseBg, color: t.inverseText, border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, lineHeight: 1, zIndex: 10 }}
                            >
                              ✕
                            </m.button>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}

                  {addingInSlot !== null && (
                    <input
                      key="adding"
                      // eslint-disable-next-line jsx-a11y/no-autofocus
                      autoFocus
                      value={newThemeInput}
                      onChange={(e) => setNewThemeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newThemeInput.trim()) confirmAddTheme(addingInSlot)
                        if (e.key === 'Escape') { setAddingInSlot(null); setNewThemeInput('') }
                      }}
                      onBlur={() => { setAddingInSlot(null); setNewThemeInput('') }}
                      placeholder="Theme name…"
                      aria-label="New theme"
                      style={{ padding: '7px 13px', borderRadius: 999, border: `1px solid ${t.ember}`, background: t.inputBg, color: t.textPrimary, fontSize: 12, outline: 'none', lineHeight: 1, width: 140, flexShrink: 0 }}
                    />
                  )}

                  {addingInSlot === null && territorySlots.filter(Boolean).length < MAX_TERRITORY_SLOTS && (
                    <button
                      onClick={() => {
                        const nextIndex = territorySlots.findIndex((s) => s === null)
                        setAddingInSlot(nextIndex !== -1 ? nextIndex : territorySlots.length)
                        setNewThemeInput('')
                      }}
                      style={{ padding: '7px 14px', borderRadius: 999, border: `1.5px dashed ${t.textMuted}`, backgroundColor: 'transparent', color: t.textMuted, fontSize: 12, cursor: 'pointer', opacity: 0.6, lineHeight: 1, flexShrink: 0 }}
                    >
                      + Add theme
                    </button>
                  )}
                </div>
              )}
            </div>

            <Divider />

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Eyebrow>Energy</Eyebrow>
                <span style={{ ...typeRoles.small, fontSize: 12, fontWeight: 600, color: t.textPrimary }}>{ENERGY_LEVEL_LABELS[energyLevel]}</span>
              </div>
              <input type="range" min={0} max={4} value={energyIndex} onChange={(e) => setEnergyIndex(Number(e.target.value))} className="idea-lab-range" aria-label="Energy" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
                <span style={{ ...typeRoles.small, fontSize: 10, color: t.textMuted }}>Heavy</span>
                <span style={{ ...typeRoles.small, fontSize: 10, color: t.textMuted }}>Bright</span>
              </div>
            </div>

            <Divider />

            <div>
              <Eyebrow style={{ marginBottom: 12 }}>Question mode</Eyebrow>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderRadius: radius.field, border: `1px solid ${t.inputBorder}`, overflow: 'hidden' }}>
                {[{ v: true, l: 'Open' }, { v: false, l: 'Charged' }].map(({ v, l }) => (
                  <button key={l} onClick={() => setImpersonal(v)} aria-pressed={impersonal === v} style={{ padding: '9px 12px', border: 'none', backgroundColor: impersonal === v ? t.inverseBg : 'transparent', color: impersonal === v ? t.inverseText : t.textMuted, ...typeRoles.small, fontSize: 12, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s ease' }}>
                    {l}
                  </button>
                ))}
              </div>
              <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, marginTop: 8 }}>
                {impersonal ? 'Spacious — wide, many directions, no single right answer' : 'Direct — positions you as the only authority on the answer'}
              </p>
            </div>
          </Card>

          {/* ── The Stage ── */}
          <Card padding={0} style={{ display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <AnimatePresence mode="wait">
              {!generatedPrompt ? (
                <m.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 'clamp(40px, 8vw, 64px) clamp(20px, 5vw, 52px)', textAlign: 'center', gap: 28 }}>
                  <div>
                    <p style={{ ...typeRoles.h2, fontSize: 'clamp(22px, 3.4vw, 28px)', color: t.textPrimary, marginBottom: 10 }}>The question is waiting.</p>
                    <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textMuted }}>Configure your lens, then summon it.</p>
                  </div>
                  {error && (
                    <div style={{ backgroundColor: t.soft.danger, borderRadius: radius.field, padding: '10px 16px', maxWidth: 340, width: '100%' }}>
                      <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <PrimaryButton onClick={handleGeneratePrompt} disabled={isGenerateDisabled} loading={isGenerating} loadingLabel="Summoning…" size="lg">
                      Generate a question →
                    </PrimaryButton>
                    <UnderlineLink onClick={() => setEntry('choosing')} color={t.textMuted}>← Back</UnderlineLink>
                  </div>
                </m.div>
              ) : (
                <m.div key="active" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 'clamp(20px, 4vw, 36px)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <Eyebrow style={{ paddingTop: 4 }}>Your question</Eyebrow>
                    <GhostButton size="sm" onClick={handleGeneratePrompt} disabled={isGenerating} loading={isGenerating} loadingLabel="Asking…">Ask again</GhostButton>
                  </div>
                  <p style={{ ...typeRoles.h2, fontSize: 'clamp(20px, 2.6vw, 24px)', fontWeight: 500, lineHeight: 1.45, color: t.textPrimary }}>{generatedPrompt}</p>
                  <Divider />
                  <div>
                    <Eyebrow style={{ marginBottom: 10 }}>Write your response</Eyebrow>
                    <TextArea voice value={responseText} onChange={setResponseText} placeholder="Begin here…" ariaLabel="Your response" minRows={2} maxHeight={200} style={{ fontSize: 16 }} />
                  </div>
                  <QuietButton
                    onClick={() => {
                      if (!responseText.trim()) return
                      const params = new URLSearchParams({ seed: responseText })
                      if (generatedPrompt) params.set('question', generatedPrompt)
                      router.push(`/idea-lab/conceptualise?${params.toString()}`)
                    }}
                    disabled={!responseText.trim()}
                    full
                    size="lg"
                  >
                    Begin conceptualisation →
                  </QuietButton>
                </m.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
        </div>

        {/* ── Capture bank ── */}
        {!isLoadingCaptures && (
          <Card padding={24} style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <Eyebrow>Capture bank</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Link href="/collector" style={{ ...typeRoles.small, fontSize: 12, color: t.ember, textDecoration: 'none' }}>Open Collector →</Link>
                <Pill>{captures.length} {captures.length === 1 ? 'item' : 'items'}</Pill>
              </div>
            </div>
            {captures.length === 0 ? (
              <p style={{ ...typeRoles.small, color: t.textMuted }}>
                No captures yet. <Link href="/collector" style={{ color: t.ember }}>Start with Collector →</Link>
              </p>
            ) : (
              <div style={{ position: 'relative' }}>
                <div className="idea-lab-carousel">
                  {captures.map((capture) => (
                    <m.div key={capture.id} className="idea-lab-carousel-card" onClick={() => setSelectedCapture(capture)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} style={{ backgroundColor: t.cardBgInner, borderRadius: radius.widget, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}>
                      <p style={{ ...typeRoles.small, color: t.textPrimary, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{capture.raw_input}</p>
                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                          {capture.arc && <Pill hue={arcHue[capture.arc as Arc] ?? 'ember'} dot>{capture.arc}</Pill>}
                          {capture.thematic_territory && <Pill hue={territories.hue(capture.thematic_territory)}>{territories.short(capture.thematic_territory)}</Pill>}
                        </div>
                        <UnderlineLink onClick={() => router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(capture.unpacked)}`)} color={t.ember}>Develop this →</UnderlineLink>
                      </div>
                    </m.div>
                  ))}
                </div>
                {captures.length > 3 && <div aria-hidden style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, background: `linear-gradient(to right, transparent, ${t.cardBg})`, pointerEvents: 'none' }} />}
              </div>
            )}
          </Card>
        )}
      </Container>

      {selectedCapture && (
        <ModalDialog
          onClose={() => setSelectedCapture(null)}
          title="Capture"
          subtitle={
            <>
              {selectedCapture.arc && <span>{selectedCapture.arc}</span>}
              {selectedCapture.arc && selectedCapture.thematic_territory && <span>·</span>}
              {selectedCapture.thematic_territory && <span>{territories.label(selectedCapture.thematic_territory)}</span>}
            </>
          }
          footer={<PrimaryButton onClick={() => router.push(`/idea-lab/conceptualise?seed=${encodeURIComponent(selectedCapture.unpacked)}`)} full>Develop this →</PrimaryButton>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedCapture.raw_input && (
              <Card padding={16}>
                <Eyebrow style={{ marginBottom: 8 }}>What I captured</Eyebrow>
                <p style={{ ...typeRoles.ui, color: t.textPrimary }}>{selectedCapture.raw_input}</p>
              </Card>
            )}
            {selectedCapture.url && (
              <Card padding={16}>
                <Eyebrow style={{ marginBottom: 6 }}>Source</Eyebrow>
                <a href={selectedCapture.url} target="_blank" rel="noopener noreferrer" style={{ ...typeRoles.small, color: t.ember, wordBreak: 'break-all' }}>{selectedCapture.url}</a>
              </Card>
            )}
            {selectedCapture.unpacked && (
              <Card padding={16}>
                <Eyebrow style={{ marginBottom: 8 }}>Analysis</Eyebrow>
                <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>{selectedCapture.unpacked}</p>
              </Card>
            )}
          </div>
        </ModalDialog>
      )}
    </PageShell>
  )
}
