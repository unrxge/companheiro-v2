'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion as m, AnimatePresence } from 'motion/react'
import { readTextStream } from '@/lib/stream-client'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { Thread, Composer, type ThreadMessage } from '@/components/conversation/thread'
import { writeHrefForNode } from '@/components/widgets'
import { shell, type as typeRoles, widths } from '@/lib/design-tokens'

interface PendingLens {
  lens: string
  energy: string
}

const ENERGY_SCALE = ['hushed', 'measured', 'vivid', 'thunderous']

function energyIndexFor(word?: string): number {
  if (!word) return 1
  const idx = ENERGY_SCALE.indexOf(word.toLowerCase())
  return idx === -1 ? 1 : idx
}

function ReimagineContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const nodeId = searchParams.get('node_id')

  const [projectId, setProjectId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [inputText, setInputText] = useState('')
  const inputTextRef = useRef('')
  inputTextRef.current = inputText
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pendingLens, setPendingLens] = useState<PendingLens | null>(null)
  const [energyIndex, setEnergyIndex] = useState(1)
  const [isGenerating, setIsGenerating] = useState(false)
  const [output, setOutput] = useState('')
  const [copied, setCopied] = useState(false)

  const { isRecording, interimText: dictationInterim, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      setInputText((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text)
    }, []),
    getContext: () => inputTextRef.current.slice(-80),
  })
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!nodeId) {
      router.push('/project-board')
      return
    }
    fetchAIResponse([])
    fetch(`/api/write/node?node_id=${nodeId}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setProjectId(data.piece.project_id) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight
  }, [messages, pendingLens, output])

  const fetchAIResponse = async (conversationHistory: ThreadMessage[]) => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/write/reimagine/converse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_id: nodeId, messages: conversationHistory }),
      })

      if (!res.ok) {
        setError('Failed to get response')
        return
      }

      setMessages([...conversationHistory, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ lens?: string; energy?: string }>(
        res,
        (visibleText) => {
          setMessages([...conversationHistory, { role: 'assistant', content: visibleText }])
        },
        ['<lens>', '<energy>']
      )

      if (!text) {
        setMessages(conversationHistory)
        setError('Failed to get response')
        return
      }

      if (meta?.lens) {
        setPendingLens({ lens: meta.lens, energy: meta.energy || ENERGY_SCALE[1] })
        setEnergyIndex(energyIndexFor(meta.energy))
      }
    } catch (err) {
      console.error('Reimagine converse error:', err)
      setError('Failed to get response. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSend = async () => {
    if (!inputText.trim() || isLoading) return

    const updatedMessages: ThreadMessage[] = [...messages, { role: 'user', content: inputText.trim() }]
    setMessages(updatedMessages)
    setInputText('')
    setPendingLens(null)
    setOutput('')

    await fetchAIResponse(updatedMessages)
  }

  const runReimagine = async () => {
    if (!pendingLens || !nodeId || isGenerating) return
    setIsGenerating(true)
    setOutput('')
    try {
      const res = await fetch('/api/write/reimagine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          node_id: nodeId,
          lens_description: pendingLens.lens,
          energy: ENERGY_SCALE[energyIndex],
        }),
      })
      if (!res.ok) {
        setOutput('Something went wrong. Try again.')
        return
      }
      await readTextStream(res, (visibleText) => setOutput(visibleText))
    } catch (err) {
      console.error('Reimagine run error:', err)
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

  if (!nodeId) return null

  return (
    <PageShell mood="violet" maxWidth={widths.conversation + 160} fill>
      <PageHeader
        eyebrow="Write · Shape"
        title="Reimagine"
        subtitle="Find a lens for the piece, then see it rewritten through it. The draft stays as it is."
        size="md"
        back={writeHrefForNode({ projectId, nodeId })}
      />

      <Container fill flush padding={0}>
        <div ref={threadRef} className="reimagine-scroll" style={{ flex: 1, overflowY: 'auto', padding: '28px 24px' }}>
          <style>{`.reimagine-scroll::-webkit-scrollbar { display: none; } .reimagine-scroll { scrollbar-width: none; }`}</style>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Thread messages={messages} streaming={isLoading}>
              <AnimatePresence>
                {pendingLens && !isLoading && (
                  <m.div key="lens" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.35 }}>
                    <Card>
                      <Eyebrow style={{ marginBottom: 10 }}>The lens</Eyebrow>
                      <p style={{ ...typeRoles.quote, color: t.textPrimary, marginBottom: 16 }}>{pendingLens.lens}</p>

                      <Eyebrow style={{ marginBottom: 8 }}>Energy</Eyebrow>
                      <div role="radiogroup" aria-label="Energy" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                        {ENERGY_SCALE.map((label, i) => (
                          <Pill key={label} size="md" hue="violet" selected={i === energyIndex} onClick={() => setEnergyIndex(i)}>
                            {label}
                          </Pill>
                        ))}
                      </div>

                      <PrimaryButton onClick={runReimagine} loading={isGenerating} loadingLabel="Reimagining…" full>
                        {output ? 'Run it again' : 'Reimagine it'}
                      </PrimaryButton>
                      <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, textAlign: 'center', marginTop: 10 }}>or keep talking below to change the lens</p>
                    </Card>
                  </m.div>
                )}
              </AnimatePresence>

              {(output || isGenerating) && (
                <Card>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <Eyebrow>Reimagined</Eyebrow>
                    {output && !isGenerating && <GhostButton size="sm" onClick={copyOutput}>{copied ? 'Copied' : 'Copy'}</GhostButton>}
                  </div>
                  {output ? (
                    <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.7, color: t.textPrimary, whiteSpace: 'pre-wrap', margin: 0 }}>{output}</p>
                  ) : (
                    <p style={{ ...typeRoles.small, color: t.textMuted, margin: 0 }}>Reimagining…</p>
                  )}
                </Card>
              )}

              {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
            </Thread>
          </div>
        </div>

        <div style={{ padding: '14px 24px 18px', borderTop: `1px solid ${t.divider}`, flexShrink: 0 }}>
          <div style={{ maxWidth: widths.conversation, margin: '0 auto' }}>
            <Composer
              value={inputText + (dictationInterim ? (inputText && !inputText.endsWith(' ') ? ' ' : '') + dictationInterim : '')}
              onChange={(v) => { clearInterim(); setInputText(v) }}
              onSend={handleSend}
              disabled={isLoading}
              placeholder="Say what it wants to become…"
              recording={isRecording}
              onToggleRecording={handleRecordToggle}
            />
          </div>
        </div>
      </Container>
    </PageShell>
  )
}

export default function ReimaginePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <ReimagineContent />
    </Suspense>
  )
}
