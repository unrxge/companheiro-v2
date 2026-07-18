'use client'

import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { readTextStream } from '@/lib/stream-client'
import { LENSES } from '@/lib/lenses'

function ReimagineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [activeLens, setActiveLens] = useState<string | null>(null)
  const [output, setOutput] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  const runLens = async (lensKey: string) => {
    if (!pieceId || isGenerating) return
    setActiveLens(lensKey)
    setOutput('')
    setIsGenerating(true)
    try {
      const res = await fetch('/api/write/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId, lens: lensKey }),
      })
      if (!res.ok) {
        setOutput('Something went wrong. Try again.')
        return
      }
      await readTextStream(res, (visibleText) => setOutput(visibleText))
    } catch (err) {
      console.error('Reimagine failed:', err)
      setOutput('Failed to reimagine. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const copyOutput = () => {
    navigator.clipboard.writeText(output)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="min-h-screen bg-[#111110] flex flex-col">
      <div className="h-12 border-b border-[#1f1f1d] flex items-center justify-between px-6 flex-shrink-0">
        <button
          onClick={() => router.push(`/write?piece_id=${pieceId}`)}
          className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
        >
          ← Back to writing
        </button>
        <button
          onClick={() => router.push(`/write/translate?piece_id=${pieceId}`)}
          className="text-[#a8a6a0] hover:text-[#e8e6e1] text-sm transition-colors underline"
        >
          Translate →
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Reimagine</h1>
            <p className="text-sm text-[#4a4946]">
              Run the whole piece through a lens to find a form you might not have reached alone.
            </p>
          </div>

          {/* Lens gallery */}
          <div className="grid grid-cols-2 gap-3">
            {LENSES.map((lens) => (
              <button
                key={lens.key}
                onClick={() => runLens(lens.key)}
                disabled={isGenerating}
                className={`text-left p-4 rounded border transition-all disabled:cursor-not-allowed ${
                  activeLens === lens.key
                    ? 'bg-[#e8e6e1] border-[#e8e6e1] text-[#111110]'
                    : 'bg-transparent border-[#2e2d2a] text-[#d4d2cd] hover:border-[#4a4946] disabled:opacity-50'
                }`}
              >
                <p className="text-sm font-medium">{lens.label}</p>
                <p className={`text-xs mt-1 ${activeLens === lens.key ? 'text-[#4a4946]' : 'text-[#6b6966]'}`}>
                  {lens.description}
                </p>
              </button>
            ))}
          </div>

          {/* Output */}
          {(output || isGenerating) && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">
                  {LENSES.find((l) => l.key === activeLens)?.label}
                </h2>
                {output && !isGenerating && (
                  <button
                    onClick={copyOutput}
                    className="text-xs text-[#6b6966] hover:text-[#d4d2cd] underline transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
              <div className="bg-[#161614] border border-[#1f1f1d] rounded p-5">
                {output ? (
                  <p className="text-base text-[#d4d2cd] leading-relaxed whitespace-pre-wrap">{output}</p>
                ) : (
                  <p className="text-sm text-[#6a6866]">Reimagining…</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ReimaginePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
