'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion as m, AnimatePresence } from 'motion/react'
import { useDictation } from '@/lib/use-dictation'
import { readTextStream } from '@/lib/stream-client'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { Thread, Composer, type ThreadMessage } from '@/components/conversation/thread'
import { PhaseDots } from '@/components/widgets'
import { type as typeRoles, widths } from '@/lib/design-tokens'

const TURNS = ['What circles', 'What you make', 'Your territories']

/**
 * First run. Three short turns with the companion, then four territories
 * you can edit before they become your Idea Lab. Replaces the hard-coded
 * default themes for every new account.
 */
export default function WelcomePage() {
  const router = useRouter()
  const { t } = useTheme()
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [input, setInput] = useState('')
  const inputRef = useRef('')
  inputRef.current = input
  const [isLoading, setIsLoading] = useState(false)
  const [turn, setTurn] = useState(1)
  const [labels, setLabels] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startedRef = useRef(false)

  const { isRecording, interimText, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => setInput((prev) => prev + (prev && !prev.endsWith(' ') ? ' ' : '') + text), []),
    getContext: () => inputRef.current.slice(-80),
  })

  const ask = useCallback(async (history: ThreadMessage[]) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history }) })
      if (!res.ok) { setError('Could not reach the companion. Try again.'); return }
      setMessages([...history, { role: 'assistant', content: '' }])
      const { text, meta } = await readTextStream<{ turn: number; labels: string[] }>(res, (visible) => setMessages([...history, { role: 'assistant', content: visible }]))
      setMessages([...history, { role: 'assistant', content: text }])
      if (meta) {
        setTurn(Math.min(3, meta.turn + (meta.turn < 3 ? 1 : 0)))
        if (meta.turn === 3 && meta.labels?.length) setLabels(meta.labels)
      }
    } catch (err) {
      console.error('onboarding error:', err)
      setError('Something went wrong. Try again.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ask([])
  }, [ask])

  const send = async () => {
    if (!input.trim() || isLoading) return
    const next: ThreadMessage[] = [...messages, { role: 'user', content: input.trim() }]
    setMessages(next)
    setInput('')
    clearInterim()
    await ask(next)
  }

  const commit = async () => {
    if (!labels) return
    const clean = labels.map((l) => l.trim()).filter(Boolean)
    if (clean.length === 0) { setError('Keep at least one territory.'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: clean }) })
      const d = await res.json()
      if (!res.ok || !d.success) { setError(d.error || 'Could not save your territories.'); return }
      router.replace('/home')
    } finally {
      setSaving(false)
    }
  }

  const skip = async () => {
    // Keep going with sensible defaults; can be changed any time in the Idea Lab.
    setSaving(true)
    try {
      await fetch('/api/onboarding', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ labels: ['What I keep making', 'What I am working through', 'What I refuse to give up', 'What I notice'] }) })
      router.replace('/home')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageShell mood="ember" maxWidth={widths.conversation + 120} dock={false}>
      <PageHeader eyebrow="Companheiro" title="Before anything else, your world." subtitle="Three short turns. Then this app is built around the themes your life keeps circling, not generic ones." themeToggle={false} />

      <Container>
        <div style={{ maxWidth: 420, marginBottom: 22 }}>
          <PhaseDots phase={labels ? 3 : turn} labels={TURNS} />
        </div>

        <Card>
          <Thread messages={messages} streaming={isLoading} />
        </Card>

        <AnimatePresence>
          {labels && (
            <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} style={{ marginTop: 16 }}>
              <Card>
                <Eyebrow style={{ marginBottom: 12 }}>Your territories · edit any of them</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {labels.map((label, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: [t.ember, t.verdant, t.violet, t.ochre][i % 4], flexShrink: 0 }} />
                      <TextField value={label} onChange={(v) => setLabels(labels.map((l, j) => (j === i ? v : l)))} ariaLabel={`Territory ${i + 1}`} />
                    </div>
                  ))}
                </div>
                {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginTop: 10 }}>{error}</p>}
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <PrimaryButton onClick={commit} loading={saving} loadingLabel="Building your Idea Lab…" size="lg">These are mine →</PrimaryButton>
                  <GhostButton onClick={() => setLabels(null)} disabled={saving}>Keep talking</GhostButton>
                </div>
              </Card>
            </m.div>
          )}
        </AnimatePresence>

        {!labels && (
          <div style={{ marginTop: 16 }}>
            {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger, marginBottom: 8 }}>{error}</p>}
            <Composer
              value={input + (interimText ? (input && !input.endsWith(' ') ? ' ' : '') + interimText : '')}
              onChange={(v) => { clearInterim(); setInput(v) }}
              onSend={send}
              disabled={isLoading}
              placeholder="Answer in your own words…"
              recording={isRecording}
              onToggleRecording={handleRecordToggle}
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <GhostButton size="sm" onClick={skip} disabled={saving}>Skip for now</GhostButton>
            </div>
          </div>
        )}
      </Container>
    </PageShell>
  )
}
