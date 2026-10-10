// Writes the map a territory's Idea Lab questions are drawn from: what the
// theme spans, and a set of entry points into it. Done once per territory.
//
// A theme is first sorted into a register. Inner themes keep the map they
// have always had. Concrete fields get one written by the deep model from
// real knowledge of the field, because every later question can only be as
// specific as its map.

import { anthropic } from '@/lib/anthropic'
import type { AuthedContext } from '@/lib/supabase/route'
import { pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { PRACTICES } from '@/lib/tour'
import type { Register } from '@/lib/territories'

export interface TerritoryMap {
  register: Register
  rangeMap?: string
  facetSeeds?: string[]
}

/** What helps read an ambiguous label: what the person makes, and the themes beside it. */
export interface MapContext {
  makes?: string
  otherThemes?: string[]
}

/** What they said they make at sign-up, as one line ("Cinematographer, Client projects"). */
export function makesFrom(user: AuthedContext['user']): string {
  const profile = (user.user_metadata as { profile?: { practices?: unknown; other?: unknown } } | null)?.profile
  if (!profile) return ''
  const labels = (Array.isArray(profile.practices) ? profile.practices : []).map((k) => PRACTICES.find((p) => p.key === k)?.label).filter(Boolean)
  const other = typeof profile.other === 'string' ? profile.other.trim().slice(0, 80) : ''
  return [...labels, other].filter(Boolean).join(', ')
}

export function contextLines(context?: MapContext): string {
  const lines = [
    context?.makes ? `What they make: ${context.makes}` : '',
    context?.otherThemes?.length ? `Their other themes: ${context.otherThemes.slice(0, 8).join('; ')}` : '',
  ].filter(Boolean)
  return lines.length ? `\n\n${lines.join('\n')}` : ''
}

export const CLASSIFY_SYSTEM = `A person has named a theme their creative work keeps returning to. Decide which kind of theme it is.

"inner": lived inner experience. Emotion, identity, relationships, spirituality, healing, the body, a way of living, the creative life as it is felt. A piece on it comes from the person's own experience of being human.

"field": a concrete discipline, craft, profession, medium, industry, subject or body of knowledge. Design, film, music production, food, architecture, technology, business, science, sport, history, a place, a market. Work on it is judged by what it shows, argues or makes, not by what the maker feels.

If a theme names a concrete field and a feeling together ("grief in documentary film", "burnout in startups"), answer "field".

A bare evocative word or image that names no discipline, trade or body of knowledge (light, home, the sea, money, silence, the body, the road) is "inner": people name these for what they mean to them, not as a subject they work in. Answer "field" for one only when what they make or their other themes show it is their working subject (light for a cinematographer, money for a finance writer).

If it is still unclear, answer "inner".

Return only JSON: {"register": "inner"} or {"register": "field"}`

/** Sorts one theme. Any failure answers "inner", which is how every theme was treated before. */
export async function classifyRegister(userId: string, label: string, context?: MapContext): Promise<Register> {
  try {
    const res = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 40,
      system: CLASSIFY_SYSTEM,
      messages: [{ role: 'user', content: `Theme: "${label}"${contextLines(context)}` }],
    })
    logUsage(userId, 'idea-lab/territories/register', res.model, res.usage)
    const text = res.content.find((b) => b.type === 'text')?.text ?? ''
    return /"register"\s*:\s*"field"/.test(text) ? 'field' : 'inner'
  } catch (err) {
    console.error('classifyRegister error:', err)
    return 'inner'
  }
}

export const INNER_SYSTEM = `You are writing a creative territory definition for an Idea Lab — a tool that helps writers find unexpected, dreamy, expansive entry points into a theme.

You will be given a theme label. Generate two things:

RANGE MAP — A rich description of the territory written to give a prompt-generating system room to roam. The spirit: universal over confessional (anyone can enter regardless of personal history), expansive and curious, specific and strange rather than generic. Never describe the obvious centre — find the full span including the unexpected edges.

Structure it exactly as follows (no headings, just flowing text):
- First: one or two sentences naming what this territory is really about at its fullest span — not just the surface
- Then "Contains:" followed by at least 8 specific things this territory holds — particular observations, experiences, questions, moments, tensions — comma-separated
- Then "Its lighter end:" — the expansive, forward-facing corner where possibility lives, what opens up when this territory is at its most alive
- Then "Its heavier end:" — the honest, unflinching corner where something real and unresolved lives; not bleak, but weighted

FACET SEEDS — Exactly 15 specific entry points that force a writer into different corners of this territory. Each seed is a tight phrase: a specific angle, observation, or question that names something precise and unexpected within the territory. They must cover both lighter and heavier ends. Written in the style: "the [specific thing] — [the angle or what it reveals]". Never restate the territory name obviously. Always find the edge, not the centre.

Return only valid JSON in this exact shape:
{
  "rangeMap": "...",
  "facetSeeds": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "..."]
}`

export const FIELD_SYSTEM = `You are writing a working map of a creative field for an Idea Lab: a tool that hands a practitioner one sharp question to make a piece of work from. The person has named this field as a theme their work keeps returning to. A second system will roam inside your map looking for questions, so the map has to carry real knowledge of the field: what the people who work in it actually decide, argue about and get wrong.

You are given the theme label, and sometimes what the person makes and their other themes. Use those only to read an ambiguous label correctly.

Write five parts:

"span": two sentences on what this field is at its full span: what its practitioners are deciding, for whom, and what is at stake when they get it right or wrong.

"contains": 12 specific things the field holds, each a phrase of at most 18 words. Between them cover: live tensions and trade-offs; conventions and the people who break them; the materials, tools, formats and constraints; recurring decisions and judgment calls; the people in the room (clients, audiences, collaborators, gatekeepers); arguments inside the field; the usual ways work fails; what is changing now. Use the field's own vocabulary, correctly. Concrete nouns over abstractions.

"lighterEnd": two or three sentences on where the field is most playful and possible: underused techniques, what-ifs, the ambitious version, what gets better when someone takes a risk.

"heavierEnd": two or three sentences on its unresolved problems: constraints nobody escapes, trade-offs with no clean answer, what practitioners know and rarely say, where good work is hard to defend.

"facetSeeds": exactly 15 entry points, each a tight phrase in the style "the [specific thing] — [the angle on it]". Spread them across different kinds: a tension between two goods; a convention and what it costs; one particular object, format or type of job; a decision moment; the relationship with whoever the work is for; a constraint treated as a brief; something that has changed; something outsiders misunderstand; a crossing into a neighbouring field. About five from the lighter end, five from the heavier end and five from the working middle. Each must be specific enough that it could not belong to any other field.

Rules:
- Keep to the field. Do not turn it into inner life: no healing, no soul, no "what it teaches us about being human". Feeling belongs only where the work itself deals in it.
- If the label is broad, map the breadth. If you do not know a corner of the field well, stay general and accurate there rather than inventing detail, names or statistics.
- Plain words.

Return only valid JSON in this exact shape, with nothing before or after it:
{
  "span": "...",
  "contains": ["...", "..."],
  "lighterEnd": "...",
  "heavierEnd": "...",
  "facetSeeds": ["...", "..."]
}`

type ParsedMap = { rangeMap: string; facetSeeds: string[] }

function parseJson(text: string): Record<string, unknown> | null {
  // The object alone: a code fence or a closing remark around it is dropped.
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  const cleaned = start >= 0 && end > start ? text.slice(start, end + 1) : text.trim()
  try {
    return JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    console.error('territory map: could not parse', cleaned.slice(0, 200))
    return null
  }
}

function seedsFrom(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 15)
}

function parseMap(text: string): ParsedMap | null {
  const parsed = parseJson(text)
  const facetSeeds = seedsFrom(parsed?.facetSeeds)
  if (!parsed || typeof parsed.rangeMap !== 'string' || facetSeeds.length === 0) return null
  return { rangeMap: parsed.rangeMap, facetSeeds }
}

// A field's map comes back in parts and is put together here, in the same
// order and under the same headings an inner map uses ("Contains:", "Its
// lighter end:", "Its heavier end:"), which is what the energy setting reads.
function parseFieldMap(text: string): ParsedMap | null {
  const parsed = parseJson(text)
  if (!parsed) return null
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const span = str(parsed.span)
  const contains = (Array.isArray(parsed.contains) ? parsed.contains : []).map((x) => String(x).trim().replace(/[;.]+$/, '')).filter(Boolean)
  const lighter = str(parsed.lighterEnd)
  const heavier = str(parsed.heavierEnd)
  const facetSeeds = seedsFrom(parsed.facetSeeds)
  if (!span || contains.length < 6 || !lighter || !heavier || facetSeeds.length < 8) return null
  return { rangeMap: `${span}\n\nContains: ${contains.join('; ')}.\n\nIts lighter end: ${lighter}\n\nIts heavier end: ${heavier}`, facetSeeds }
}

/** Writes the map for a theme already sorted into a register. Null when the model's answer could not be read. */
export async function writeMap(auth: Pick<AuthedContext, 'user'>, label: string, register: Register, context?: MapContext): Promise<ParsedMap | null> {
  const field = register === 'field'
  const attempt = async () => {
    const res = await anthropic.messages.create({
      // An inner map is the job the fast model has always done well. A field's
      // map needs to know the field, and is paid for once per territory.
      model: field ? pickModel(auth, MODELS.deep) : MODELS.fast,
      max_tokens: field ? 2400 : 1200,
      system: field ? FIELD_SYSTEM : INNER_SYSTEM,
      messages: [{ role: 'user', content: field ? `Theme: "${label}"${contextLines(context)}` : `Generate a range map and facet seeds for the territory: "${label}"` }],
    })
    logUsage(auth.user.id, field ? 'idea-lab/territories/generate-map:field' : 'idea-lab/territories/generate-map', res.model, res.usage)
    const text = res.content.find((b) => b.type === 'text')?.text ?? ''
    return field ? parseFieldMap(text) : parseMap(text)
  }
  // A field map with a part missing would quietly weaken every question drawn from it: ask once more.
  return (await attempt()) ?? (field ? await attempt() : null)
}

/**
 * Sorts a theme and writes its map. `keepInnerMap` is for a territory that
 * already has one: if it turns out to be an inner theme, only the register
 * comes back and the map it has is left alone.
 */
export async function mapTerritory(auth: Pick<AuthedContext, 'user'>, label: string, opts: { context?: MapContext; keepInnerMap?: boolean } = {}): Promise<TerritoryMap> {
  const register = await classifyRegister(auth.user.id, label, opts.context)
  if (register === 'inner' && opts.keepInnerMap) return { register }
  const map = await writeMap(auth, label, register, opts.context)
  return map ? { register, ...map } : { register }
}
