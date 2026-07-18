'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface CoverageItem {
  item: string
  status: 'landed' | 'partial' | 'missing'
  note: string
}

interface TestResult {
  coverage: CoverageItem[]
  emotional_journey: { verdict: string; drift: string }
  challenge: string[]
}

const STATUS_STYLE: Record<CoverageItem['status'], { dot: string; label: string; text: string }> = {
  landed: { dot: 'bg-[#10B981]', label: 'Landed', text: 'text-[#6ee7b7]' },
  partial: { dot: 'bg-[#F59E0B]', label: 'Partial', text: 'text-[#fbbf6a]' },
  missing: { dot: 'bg-[#EF4444]', label: 'Missing', text: 'text-[#fca5a5]' },
}

function TestContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pieceId = searchParams.get('piece_id')

  const [result, setResult] = useState<TestResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    runTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  const runTest = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/write/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ piece_id: pieceId }),
      })
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult(data)
      }
    } catch (err) {
      console.error('Test failed:', err)
      setError('Failed to test the draft. Please try again.')
    } finally {
      setIsLoading(false)
    }
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
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/write/reimagine?piece_id=${pieceId}`)}
            className="text-[#8c8a87] hover:text-[#e8e6e1] text-sm transition-colors"
          >
            Reimagine →
          </button>
          <button
            onClick={() => router.push(`/write/translate?piece_id=${pieceId}`)}
            className="text-[#a8a6a0] hover:text-[#e8e6e1] text-sm transition-colors underline"
          >
            Translate →
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-12">
        <div className="max-w-2xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-light text-[#e8e6e1] mb-2">Test</h1>
            <p className="text-sm text-[#4a4946]">Your finished draft, read cold against what you set out to make.</p>
          </div>

          {isLoading ? (
            <p className="text-sm text-[#6a6866]">Reading the whole thing…</p>
          ) : error ? (
            <div className="bg-red-900/20 border border-red-700/30 rounded p-3">
              <p className="text-xs text-red-200">{error}</p>
            </div>
          ) : result ? (
            <>
              {/* Coverage */}
              {result.coverage.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">What you wanted in it</h2>
                  <div className="space-y-2">
                    {result.coverage.map((c, i) => {
                      const st = STATUS_STYLE[c.status] || STATUS_STYLE.partial
                      return (
                        <div key={i} className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${st.dot}`} />
                            <span className="text-sm text-[#e8e6e1] flex-1">{c.item}</span>
                            <span className={`text-xs uppercase tracking-widest ${st.text}`}>{st.label}</span>
                          </div>
                          {c.note && <p className="text-sm text-[#8c8a87] leading-relaxed pl-4">{c.note}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Emotional journey */}
              {result.emotional_journey.verdict && (
                <div className="space-y-3">
                  <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">The emotional arc</h2>
                  <div className="bg-[#161614] border border-[#1f1f1d] rounded p-4 space-y-2">
                    <p className="text-sm text-[#d4d2cd] leading-relaxed">{result.emotional_journey.verdict}</p>
                    {result.emotional_journey.drift && (
                      <p className="text-sm text-[#fbbf6a] leading-relaxed">
                        Where it drifts: {result.emotional_journey.drift}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Challenge */}
              {result.challenge.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm text-[#4a4946] uppercase tracking-widest">The hard questions</h2>
                  <div className="space-y-2">
                    {result.challenge.map((q, i) => (
                      <div key={i} className="bg-[#161614] border border-[#1f1f1d] rounded p-4">
                        <p className="text-sm text-[#d4d2cd] leading-relaxed">{q}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  onClick={runTest}
                  className="text-xs text-[#6b6966] hover:text-[#d4d2cd] underline transition-colors"
                >
                  Test again
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function WriteTestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#111110] flex items-center justify-center">
          <p className="text-[#4a4946]">Loading...</p>
        </div>
      }
    >
      <TestContent />
    </Suspense>
  )
}
