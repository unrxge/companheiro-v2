// Reading the canvas: the vision as it stands, and where it does not hold
// together. Made only when the person asks for it, never on a timer and never
// on opening the room, and kept with its date so a later change to the canvas
// shows as a change.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { nowIso } from '@/lib/studio/db'
import { parseJsonObject } from '@/lib/studio/talk/sort'
import { normalise } from '@/lib/studio/talk/verbatim'
import { READING_SYSTEM } from './prompts'
import { keptText, type Canvas } from './store'
import type { Gap, Reading, VisionState } from './types'

const MAX_GAPS = 5

export async function readCanvas(auth: AuthedContext, canvas: Canvas, vision: VisionState): Promise<Reading> {
  const dismissed = vision.gaps_dismissed.length ? vision.gaps_dismissed.map((g) => `- ${g}`).join('\n') : '(none)'
  const model = pickModel(auth, MODELS.vision)
  const stream = anthropic.messages.stream({
    model,
    // Thinking is always on with this model and is counted here too.
    max_tokens: 6000,
    // Only the strongest model takes an effort level this way; past the soft
    // cap the fast one stands in and the field is left off.
    ...(model === MODELS.vision ? { output_config: { effort: 'high' as const } } : {}),
    system: READING_SYSTEM,
    messages: [{
      role: 'user',
      content: `THE CANVAS\n\n${canvas.text}\n\n${keptText(vision)}\n\nNOT A GAP, THEY SAID:\n${dismissed}`,
    }],
  })
  const res = await stream.finalMessage()
  logUsage(auth.user.id, 'studio/vision-reading', res.model, res.usage)

  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const raw = parseJsonObject(text)
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const refused = new Set(vision.gaps_dismissed.map(normalise))
  const gaps: Gap[] = []
  for (const g of Array.isArray(rec.gaps) ? rec.gaps : []) {
    if (!g || typeof g !== 'object') continue
    const item = g as Record<string, unknown>
    const line = typeof item.text === 'string' ? item.text.replace(/\s+/g, ' ').trim() : ''
    if (!line || line.length > 400 || refused.has(normalise(line))) continue
    const where = (Array.isArray(item.where) ? item.where : []).filter((w): w is string => typeof w === 'string' && !!w.trim()).map((w) => w.trim()).slice(0, 6)
    gaps.push({ id: crypto.randomUUID(), text: line, where })
    if (gaps.length >= MAX_GAPS) break
  }
  return {
    at: nowIso(),
    statement: typeof rec.statement === 'string' ? rec.statement.trim().slice(0, 1200) : '',
    gaps,
    signature: canvas.signature,
  }
}
