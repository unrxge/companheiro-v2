'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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

const ALIVE_PROMPTS: Record<string, string> = {
  default: 'What feels alive today?',
  Breakaway: 'What needs to break away?',
  Beginning: 'What wants to begin?',
  Expansion: 'Where can you grow?',
  Integration: 'What wants to come together?',
  'Breakaway,Beginning': 'What ends so something new can start?',
  'Breakaway,Expansion': 'What friction is asking you to expand?',
  'Breakaway,Integration': 'What dissolution leads to wholeness?',
  'Beginning,Expansion': 'How can this beginning deepen?',
  'Beginning,Integration': 'What new thing wants to become whole?',
  'Expansion,Integration': 'How can growth find its form?',
}

export default function IdeaLabPage() {
  const router = useRouter()
  const [selectedArcs, setSelectedArcs] = useState<Arc[]>([])
  const [useRandomArcs, setUseRandomArcs] = useState(false)
  const [selectedTerritories, setSelectedTerritories] = useState<Territory[]>([])
  const [skipTerritories, setSkipTerritories] = useState(false)
  const [useRandomTerritories, setUseRandomTerritories] = useState(false)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [continuations, setContinuations] = useState<Continuation[]>([])
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [responseText, setResponseText] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    if (!useRandomArcs) {
      setSelectedArcs([])
    }
  }

  const toggleTerritory = (territory: Territory) => {
    setSelectedTerritories((prev) =>
      prev.includes(territory) ? prev.filter((t) => t !== territory) : [...prev, territory]
    )
  }

  const handleSkipTerritories = () => {
    setSkipTerritories(!skipTerritories)
    if (!skipTerritories) {
      setUseRandomTerritories(false)
      setSelectedTerritories([])
    }
  }

  const handleRandomTerritories = () => {
    setUseRandomTerritories(!useRandomTerritories)
    if (!useRandomTerritories) {
      setSkipTerritories(false)
      setSelectedTerritories([])
    }
  }

  const getAlivePrompt = () => {
    if (selectedArcs.length === 0) return ALIVE_PROMPTS.default

    const key = selectedArcs.sort().join(',')
    return ALIVE_PROMPTS[key] || ALIVE_PROMPTS.default
  }

  const handleGeneratePrompt = async () => {
    if (selectedArcs.length === 0 && !useRandomArcs) {
      setError('Please select at least one arc or use random')
      return
    }

    setIsGenerating(true)
    setError(null)

    try {
      const payload: {
        arcs?: Arc[]
        randomArcs?: boolean
        territories?: Territory[] | null
        randomTerritories?: boolean
      } = {}

      if (useRandomArcs) {
        payload.randomArcs = true
      } else {
        payload.arcs = selectedArcs
      }

      if (skipTerritories) {
        payload.territories = null
      } else if (useRandomTerritories) {
        payload.randomTerritories = true
      } else if (selectedTerritories.length > 0) {
        payload.territories = selectedTerritories
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
        setError('Failed to generate prompt')
      }
    } catch (err) {
      console.error('Prompt generation error:', err)
      setError('Failed to generate prompt. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const getTerritoryLabel = (territory: string) => {
    return TERRITORY_LABELS[territory] || territory
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <div className="flex-1 px-6 py-12 max-w-4xl mx-auto w-full">
        <div className="space-y-12">
          {/* Header */}
          <div>
            <button
              onClick={() => router.push('/project-board')}
              className="text-xs text-[#8c8a87] hover:text-[#e8e6e1] transition-colors mb-3"
            >
              ← Project Board
            </button>
            <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Idea Lab</h1>
            <p className="text-sm text-[#4a4946]">Open week mode</p>
          </div>

          {/* Arc Selector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">Select your arc(s)</h2>
              <button
                onClick={handleRandomArcs}
                className={`px-3 py-1 rounded border text-xs transition-all ${
                  useRandomArcs
                    ? 'bg-[#2e2d2a] border-[#4a4946] text-[#d4d2cd]'
                    : 'bg-transparent border-[#2e2d2a] text-[#8c8a87] hover:border-[#4a4946]'
                }`}
                title="Randomize arc selection"
              >
                🎲
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(ARC_DEFINITIONS) as Arc[]).map((arc) => (
                <button
                  key={arc}
                  onClick={() => toggleArc(arc)}
                  disabled={useRandomArcs}
                  className={`p-4 rounded border transition-all ${
                    useRandomArcs
                      ? 'bg-transparent border-[#1a1a18] text-[#3d3c39] cursor-not-allowed opacity-40'
                      : selectedArcs.includes(arc)
                        ? 'bg-[#e8e6e1] border-[#e8e6e1] text-[#111110]'
                        : 'bg-transparent border-[#2e2d2a] text-[#d4d2cd] hover:border-[#4a4946]'
                  }`}
                >
                  <p className="font-medium text-sm">The {arc}</p>
                  <p className="text-xs mt-1 text-[#8c8a87]">{ARC_DEFINITIONS[arc]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Territory Selector */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                Select thematic territories
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handleRandomTerritories}
                  className={`px-3 py-1 rounded border text-xs transition-all ${
                    useRandomTerritories
                      ? 'bg-[#2e2d2a] border-[#4a4946] text-[#d4d2cd]'
                      : 'bg-transparent border-[#2e2d2a] text-[#8c8a87] hover:border-[#4a4946]'
                  }`}
                  title="Randomize territory selection"
                >
                  🎲
                </button>
                <button
                  onClick={handleSkipTerritories}
                  className={`px-3 py-1 rounded border text-xs font-medium transition-all ${
                    skipTerritories
                      ? 'bg-[#2e2d2a] border-[#4a4946] text-[#d4d2cd]'
                      : 'bg-transparent border-[#2e2d2a] text-[#8c8a87] hover:border-[#4a4946]'
                  }`}
                >
                  Skip
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {TERRITORIES.map((territory) => (
                <button
                  key={territory}
                  onClick={() => toggleTerritory(territory)}
                  disabled={skipTerritories || useRandomTerritories}
                  className={`p-4 rounded border transition-all ${
                    skipTerritories || useRandomTerritories
                      ? 'bg-transparent border-[#1a1a18] text-[#3d3c39] cursor-not-allowed opacity-40'
                      : selectedTerritories.includes(territory)
                        ? 'bg-[#e8e6e1] border-[#e8e6e1] text-[#111110]'
                        : 'bg-transparent border-[#2e2d2a] text-[#d4d2cd] hover:border-[#4a4946]'
                  }`}
                >
                  <p className="font-medium text-sm">{TERRITORY_LABELS[territory]}</p>
                </button>
              ))}
            </div>
          </div>

          {/* What feels alive prompt */}
          <div className="space-y-2">
            <p className="text-lg text-[#d4d2cd] font-light">{getAlivePrompt()}</p>
            <div className="h-px bg-[#1f1f1d]"></div>
          </div>

          {/* Generated Prompt */}
          {generatedPrompt && (
            <div className="space-y-3">
              <div className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-3">
                <p className="text-xs text-[#4a4946] uppercase tracking-widest">Generated prompt</p>
                <p className="text-base text-[#d4d2cd] leading-relaxed">{generatedPrompt}</p>
              </div>

              <textarea
                value={responseText}
                onChange={(e) => {
                  setResponseText(e.target.value)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                }}
                placeholder="What do you think? Write your response..."
                rows={1}
                className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
                style={{ resize: 'none', overflowY: 'auto', maxHeight: '150px' }}
              />

              <button
                onClick={() => {
                  if (responseText.trim()) {
                    router.push(
                      `/idea-lab/conceptualise?seed=${encodeURIComponent(responseText)}`
                    )
                  }
                }}
                disabled={!responseText.trim()}
                className="w-full py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Begin conceptualisation
              </button>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGeneratePrompt}
              disabled={(selectedArcs.length === 0 && !useRandomArcs) || isGenerating}
              className="flex-1 py-2 bg-[#e8e6e1] text-[#111110] text-xs font-medium rounded transition-colors hover:bg-[#d4d2cd] disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate prompt'}
            </button>
            <button
              onClick={() => router.push('/idea-lab/conceptualise')}
              className="flex-1 py-2 bg-transparent border border-[#2e2d2a] text-[#8c8a87] text-xs font-medium rounded transition-colors hover:border-[#4a4946] hover:text-[#d4d2cd]"
            >
              Start from scratch
            </button>
          </div>

          {/* Capture Bank */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm text-[#4a4946] uppercase tracking-widest mb-4">
                Capture bank ({captures.length})
              </h2>
              {isLoadingCaptures ? (
                <p className="text-sm text-[#3d3c39]">Loading captures...</p>
              ) : captures.length === 0 ? (
                <p className="text-sm text-[#3d3c39]">
                  No captures yet. Start with the{' '}
                  <Link href="/collector" className="text-[#8c8a87] underline hover:text-[#d4d2cd]">
                    Collector
                  </Link>
                  .
                </p>
              ) : (
                <div className="space-y-3">
                  {captures.map((capture) => (
                    <div
                      key={capture.id}
                      className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-3"
                    >
                      <p className="text-sm text-[#d4d2cd] leading-relaxed">{capture.unpacked}</p>

                      <div className="flex gap-2 items-center text-xs">
                        <span className="text-[#4a4946]">Arc:</span>
                        <span className="text-[#8c8a87]">{capture.arc}</span>
                        <span className="text-[#3d3c39]">•</span>
                        <span className="text-[#4a4946]">Territory:</span>
                        <span className="text-[#8c8a87]">{getTerritoryLabel(capture.thematic_territory)}</span>
                      </div>

                      <button
                        onClick={() =>
                          router.push(
                            `/idea-lab/conceptualise?seed=${encodeURIComponent(capture.unpacked)}`
                          )
                        }
                        className="text-xs text-[#6b6966] underline underline-offset-2 hover:text-[#8c8a87] transition-colors"
                      >
                        Develop this
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Open threads from past work */}
            {continuations.length > 0 && (
              <div>
                <h2 className="text-sm text-[#4a4946] uppercase tracking-widest mb-4">
                  Open threads from past work
                </h2>
                <div className="space-y-3">
                  {continuations.map((cont, idx) => (
                    <div
                      key={idx}
                      className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-2"
                    >
                      {cont.what_it_opened && (
                        <div>
                          <p className="text-xs text-[#a8a6a0] uppercase tracking-widest mb-1">
                            What it opened
                          </p>
                          <p className="text-sm text-[#d4d2cd]">{cont.what_it_opened}</p>
                        </div>
                      )}
                      {cont.natural_continuations.length > 0 && (
                        <div>
                          <p className="text-xs text-[#a8a6a0] uppercase tracking-widest mb-1">
                            Natural next steps
                          </p>
                          <ul className="text-sm text-[#8c8a87] space-y-1">
                            {cont.natural_continuations.map((next, nextIdx) => (
                              <li key={nextIdx} className="text-xs">
                                • {next}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
