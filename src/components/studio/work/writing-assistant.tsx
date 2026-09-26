'use client'

// The Write page's assistant, on the writing page. "Talk it through" sees the
// shape of the work and never its prose; this one reads the part being
// written and what comes before it, and coaches the words: questions in
// Reflect, a proposed rewrite in Suggest that lands as a pending edit to
// approve or reject. It uses the same route the Write page did.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { MicButton } from '@/components/ui/mic-button'
import { Label } from '@/components/studio/work/bits'
import { ModeSwitch, type CompanionMode, type ProposedEdit } from '@/components/studio/work/companion'
import type { AnchorLine } from '@/components/studio/work/write-tools'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { TreeNode } from '@/lib/studio/node-types'
import { alpha, radius } from '@/lib/design-tokens'
import { htmlToPlainText } from '@/lib/rich-text'
import { readTextStream } from '@/lib/stream-client'
import { useDictation } from '@/lib/use-dictation'
import { joinText } from '@/lib/dictation-text'

interface Message { role: 'user' | 'assistant'; content: string }

// Fed to the Living Portrait in batches, never one message at a time.
const DISTILL_BATCH = 8
const DISTILL_HIDDEN_MIN = 4

interface ChatMeta {
  proposedEdit?: { section_id: string; content: string; anchor_text: string | null }
  lockedMode?: 'coach' | null
  truncated?: boolean
}

export type WritingChat = ReturnType<typeof useWritingAssistant>

/** The conversation lives above the panel, so it survives switching tools and parts. */
export function useWritingAssistant({
  nodeId, parts, activePartId, selection, lines, lockedUntil, onProposedEdit, onClearSelection,
}: {
  nodeId: string | null
  /** The piece's parts; a piece that is one part passes itself. */
  parts: TreeNode[]
  activePartId: string | null
  selection: { nodeId: string; text: string } | null
  lines: AnchorLine[]
  lockedUntil: string | null
  onProposedEdit: (edit: ProposedEdit) => void
  onClearSelection: () => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  // Never carried over from a past session: a conversation opens reflecting.
  const [mode, setMode] = useState<CompanionMode>('coach')
  const messagesRef = useRef<Message[]>([])
  messagesRef.current = messages
  const distilledUpTo = useRef(0)

  const locked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now()
  useEffect(() => { if (locked && mode === 'write') setMode('coach') }, [locked, mode])

  const active = useMemo(
    () => parts.find((p) => p.id === activePartId) ?? (parts.length === 1 ? parts[0] : null),
    [parts, activePartId],
  )

  const flushDistillation = useCallback((all: Message[], force = false, minBatch = DISTILL_BATCH) => {
    const pending = all.slice(distilledUpTo.current)
    if (pending.length === 0) return
    if (!force && pending.length < minBatch) return
    distilledUpTo.current = all.length
    fetch('/api/write/distill', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: pending }), keepalive: true,
    }).catch((err) => console.error('Failed to distill the writing chat:', err))
  }, [])

  // A different piece starts a fresh conversation; the old one is sent off first.
  useEffect(() => {
    setMessages([])
    setInput('')
    setMode('coach')
    distilledUpTo.current = 0
    return () => flushDistillation(messagesRef.current, true)
  }, [nodeId, flushDistillation])

  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushDistillation(messagesRef.current, false, DISTILL_HIDDEN_MIN)
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [flushDistillation])

  // `spoken` is dictation the box was still showing but hadn't settled into
  // `input` yet; it's sent as part of this message.
  const send = useCallback(async (spoken = '') => {
    const text = joinText(input, spoken).trim()
    if (!text || busy || !nodeId) return
    setInput('')
    const prior = messagesRef.current
    const next: Message[] = [...prior, { role: 'user', content: text }]
    setMessages(next)
    setBusy(true)

    const say = (content: string) => setMessages([...next, { role: 'assistant', content }])
    try {
      const linesOf = (id: string) => lines.filter((l) => l.section_id === id).map((l) => l.text)
      // The model only ever sees plain prose, never the editor's markup.
      const activeSection = active
        ? {
            id: active.id, label: active.title || null, intended_emotion: active.beat || null,
            content: htmlToPlainText(active.body), is_locked: active.is_locked, anchor_lines: linesOf(active.id),
          }
        : null
      const preceding = active
        ? parts
            .filter((p) => p.position < active.position)
            .sort((a, b) => a.position - b.position)
            .map((p) => ({ label: p.title || null, content: htmlToPlainText(p.body), anchor_lines: linesOf(p.id) }))
        : []
      const selected = active && selection?.nodeId === active.id ? selection.text : null

      const res = await fetch('/api/write/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, node_id: nodeId, conversation_history: prior,
          active_section: activeSection, preceding_sections: preceding, selected_text: selected, assistant_mode: mode,
        }),
      })
      if (!res.ok) { say("Something went wrong on my end and that didn't send. Try again?"); return }

      say('')
      let result: { text: string; meta: ChatMeta | null }
      try {
        result = await readTextStream<ChatMeta>(res, say, ['<proposed_edit>'])
      } catch (err) {
        // The stream can die partway; what came through stays, marked as cut off.
        console.error('Chat stream ended early:', err)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?.role !== 'assistant') return prev
          const note = last.content ? `${last.content}\n\n— cut off there; the connection dropped mid-reply. Try again?` : "That didn't come through. Try again?"
          return [...prev.slice(0, -1), { ...last, content: note }]
        })
        return
      }
      // The lock is enforced on the server whatever this client sent.
      if (result.meta?.lockedMode === 'coach') setMode('coach')
      if (result.meta?.truncated) {
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          return last?.role === 'assistant' ? [...prev.slice(0, -1), { ...last, content: `${last.content}\n\n— ran out of room there, cut short mid-thought` }] : prev
        })
      }
      const proposed = result.meta?.proposedEdit
      if (proposed) {
        onProposedEdit({ node_id: proposed.section_id, content: proposed.content, anchor_text: proposed.anchor_text })
        onClearSelection()
      }
      if (result.text) flushDistillation([...next, { role: 'assistant', content: result.text }])
    } catch (err) {
      console.error('Failed to send chat message:', err)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant' && !last.content) return [...prev.slice(0, -1), { ...last, content: "That didn't go through. Try again?" }]
        if (last?.role === 'user') return [...prev, { role: 'assistant', content: "That didn't go through. Try again?" }]
        return prev
      })
    } finally {
      setBusy(false)
    }
  }, [active, busy, flushDistillation, input, lines, mode, nodeId, onClearSelection, onProposedEdit, parts, selection])

  return { messages, input, setInput, busy, mode, setMode, locked, active, send }
}

export function AssistantPanel({
  chat, selection, onClearSelection, lockedUntil, onRequestLock, disabled = false,
}: {
  chat: WritingChat
  selection: { nodeId: string; text: string } | null
  onClearSelection: () => void
  lockedUntil: string | null
  onRequestLock: () => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const { messages, input, setInput, busy, mode, setMode, locked, active, send } = chat
  const bottom = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLTextAreaElement | null>(null)
  const inputRef = useRef('')
  inputRef.current = input
  const dictation = useDictation({
    onAppend: (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)),
    getContext: () => inputRef.current.slice(-200),
  })
  const passage = active && selection?.nodeId === active.id ? selection.text : null

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [messages, busy])
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    const cs = getComputedStyle(el)
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    el.style.height = `${Math.min(el.scrollHeight + border, 160)}px`
    el.style.overflowY = el.scrollHeight + border > 160 ? 'auto' : 'hidden'
  }, [input, dictation.interimText])

  const shownInput = input + (dictation.interimText ? ` ${dictation.interimText}` : '')

  const sendNow = () => {
    if (busy || !shownInput.trim()) return
    void send(dictation.finish())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', minHeight: 0 }}>
      {passage ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingBottom: 4, flexShrink: 0 }}>
          <span aria-hidden style={{ color: t.tide, fontSize: 12, flexShrink: 0, marginTop: 2 }}>↳</span>
          <p style={{ ...canvasType.small, fontStyle: 'italic', flex: 1, margin: 0, color: t.textSecondary, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            “{passage}”
          </p>
          <button type="button" aria-label="Talk about the whole part instead" onClick={onClearSelection} style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: 0 }}>
            ✕
          </button>
        </div>
      ) : active ? (
        <p style={{ ...canvasType.chip, color: t.textMuted, margin: 0, flexShrink: 0 }}>
          Focused on: <span style={{ color: t.textSecondary }}>{active.title || 'this part'}</span>{active.is_locked && ' (locked)'}
        </p>
      ) : null}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Label>about the words</Label>
            <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
              {mode === 'write'
                ? "Click into a part, then ask for a suggestion when you want one. Select a specific sentence first and it will focus there; approved suggestions land in the part for you to accept."
                : "It won't write for you here. It asks questions and reflects things back until the words come from you. Select a sentence to talk about it specifically, or ask about the piece as a whole."}
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ ...canvasType.chip, color: m.role === 'user' ? t.textMuted : t.violet }}>{m.role === 'user' ? 'You' : 'Companheiro'}</span>
            <p style={{ ...canvasType.body, margin: 0, whiteSpace: 'pre-wrap', color: m.role === 'user' ? t.textSecondary : t.textPrimary }}>
              {m.content || (busy ? '…' : '')}
            </p>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {!disabled && (
        <div style={{ flexShrink: 0, display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12 }}>
          <textarea
            ref={box}
            aria-label="Ask about the words"
            value={shownInput}
            rows={1}
            placeholder={mode === 'coach' ? 'What are you trying to say here?' : 'Ask something…'}
            onChange={(e) => { dictation.clearInterim(); setInput(e.target.value) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendNow() } }}
            style={{ flex: 1, resize: 'none', ...canvasType.body, color: t.textPrimary, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', overflowY: 'hidden' }}
          />
          <MicButton recording={dictation.isRecording} onToggle={dictation.handleRecordToggle} size={34} />
          <button
            type="button"
            onClick={sendNow}
            disabled={busy || !shownInput.trim()}
            style={{
              ...canvasType.chip, padding: '8px 12px', borderRadius: radius.field, border: 'none',
              cursor: busy || !shownInput.trim() ? 'default' : 'pointer',
              background: busy || !shownInput.trim() ? alpha(t.textPrimary, 0.08) : t.inverseBg,
              color: busy || !shownInput.trim() ? t.textMuted : t.inverseText,
            }}
          >
            {busy ? '…' : 'Send'}
          </button>
        </div>
      )}

      {!disabled && <ModeSwitch mode={mode} onChange={setMode} locked={locked} lockedUntil={lockedUntil} onRequestLock={onRequestLock} />}
    </div>
  )
}
