// How an Idea Lab question is put together. The route (api/idea-lab/prompt)
// gathers what it needs from the database and the model; everything here is
// pure, so the same builder can be run and read outside a request.
//
// Two registers. "inner" is the original: themes about lived inner experience
// (grief, devotion, masculinity, slow living), where a great question surfaces
// something the person already carries. "field" is for concrete creative
// fields (brand design, documentary editing, food, architecture), where a
// great question holds a tension inside the work itself. The register is
// decided once per territory, when its map is written (lib/territory-map.ts).

import type { Register } from '@/lib/territories'

// Custom territory object sent from the frontend for user-defined themes.
// rangeMap and facetSeeds are populated by the generate-map API when the
// theme is first added; the prompt route uses them exactly like predefined ones.
export type TerritoryInput = string | {
  key: string
  label: string
  custom: true
  rangeMap?: string
  facetSeeds?: string[]
  /** What kind of theme this is. Missing on territories mapped before registers existed. */
  register?: Register
}

function resolveTerritoryLabel(t: TerritoryInput): string {
  if (typeof t === 'string') return TERRITORY_LABELS[t] || t
  return t.label
}

function resolveTerritoryRangeMap(t: TerritoryInput): string {
  if (typeof t === 'string') return TERRITORY_RANGE_MAPS[t] ?? ''
  // Custom territory: use AI-generated range map if available; fall back to label only
  if (t.rangeMap) return t.rangeMap
  if (t.register === 'field') return `${t.label}: No map has been written for this field yet. Work from what you accurately know of it: its real materials, decisions, conventions and arguments. Find a specific, unexpected corner rather than the obvious centre.`
  return `${t.label}: Enter this territory with genuine curiosity — find a specific, unexpected corner within it rather than treating it generically. Avoid the obvious centre; look for the strange edges.`
}

function resolveAllFacetSeeds(territories: TerritoryInput[]): string[] {
  return territories.flatMap(t => {
    if (typeof t === 'string') return TERRITORY_FACET_SEEDS[t] ?? []
    return t.facetSeeds ?? []
  })
}

const ALL_ARCS = ["Breakaway", "Beginning", "Expansion", "Integration"];

const ALL_TERRITORIES = [
  "creativity_devotion_curiosity",
  "healthy_masculinity_emotional_regulation",
  "inner_child_tending_expression",
  "slow_living_life_in_service",
];

const TERRITORY_LABELS: Record<string, string> = {
  creativity_devotion_curiosity: "Creativity, devotion & curiosity",
  healthy_masculinity_emotional_regulation: "Healthy masculinity & emotional regulation",
  inner_child_tending_expression: "Inner child tending & expression",
  slow_living_life_in_service: "Slow living & life in service",
};

// Full range maps — what each territory actually spans and contains,
// with explicit lighter and heavier ends for energy steering.
const TERRITORY_RANGE_MAPS: Record<string, string> = {
  creativity_devotion_curiosity: `Creativity as a way of living, not a skill to acquire. Spans: showing up to make things as a daily act of presence; the universe as endless source material, the self as receiver not inventor; devotion as sacred discipline — returning to the work regardless of mood, outcome, or audience; curiosity as a posture toward life itself, following what's alive with no agenda attached.

Contains: the specific thing that keeps pulling attention uninvited; making as prayer, making as aliveness; the childlike wonder that precedes mastery and keeps outlasting it; creating from abundance rather than from need to prove; the work that wants to exist and asks only to be listened to; ordinary moments as inexhaustible source material; sensitivity and attention as the core creative capacities.

Its lighter end: pure delight in discovery, the thing made for no one, following curiosity with nowhere particular to go, devotion that feels like love rather than duty, the faint pull of an idea not yet understood.

Its heavier end: devotion that has become performance, creative block as self-protection, the gap between what is made in private and what is allowed to be seen, the inquiry that keeps getting redirected.`,

  healthy_masculinity_emotional_regulation: `Emotional presence as a way of living, not a performance of control. Spans: feeling deeply without becoming what you feel; strength and tenderness as a single non-contradictory thing; the slow movement from performing what a man should be toward inhabiting what you actually are; integrity lived in small moments, not declared in large ones.

Contains: the courage of being truly known by another person; holding space for others because you've learned to hold it for yourself; grief as a form of love rather than weakness; the body as a reliable compass — learning to trust what its signals are actually saying; responding from groundedness instead of reacting from old fear; clear boundaries carried without apology; the specific ways emotions were taught to be a liability, and what replaces that.

Its lighter end: emotional steadiness as a quiet form of leadership; vulnerability that deepens rather than collapses; the moment you respond instead of react and feel the difference; masculine tenderness as something that doesn't need defending; the warmth of letting people actually know you.

Its heavier end: armor that once protected but now isolates; patterns inherited from men who couldn't show theirs; performing strength while feeling nothing underneath.`,

  inner_child_tending_expression: `Remaining in relationship with the parts of yourself that are still young, curious, and unfinished — not as nostalgia but as a living practice. Spans: play and wonder as legitimate adult capacities; giving expression to what was silenced, hurried, or shamed into smallness; making things that are messy and unserious and not needing them to be otherwise; the creative self as innocent and uncontaminated by performance.

Contains: the specific dream that keeps returning despite being long ago set aside; the feeling of being genuinely absorbed in something with no concern for outcome; wonder at ordinary things — light through a window, language, a story that lands unexpectedly; giving the younger version of yourself something it needed and didn't receive; self-compassion as a practice of returning gently, not a destination to arrive at; the capacity to be moved by small things; emotions as information to be met rather than managed.

Its lighter end: the return of genuine play; making something for no one and feeling the rightness of it; being absorbed without agenda; creativity as self-love; the wonder that precedes understanding; the dream that still matters.

Its heavier end: the parts that were silenced or hurried past; grief for things never expressed; shame that grew around wanting too much or feeling too much; the inner critic as a voice that was never really yours.`,

  slow_living_life_in_service: `Living at a human pace in a world that doesn't reward it — not as withdrawal but as presence. Spans: simplicity as a deliberate choice rather than deprivation; service as love made practical; the sacred discovered inside ordinary routines; giving full attention to what is here as a form of devotion.

Contains: the specific pleasure of an unhurried morning; showing up fully to something small; silence as a companion rather than an absence; slowness as a form of wisdom — noticing what speed keeps missing; the feeling of mattering to a particular person in a particular moment; contribution without performance; being part of something larger without needing to name it; the world as genuinely enough when you slow down enough to notice.

Its lighter end: simple sensory richness — the quality of light, the weight of a routine that holds you; moving from self-discovery toward self-offering; service that comes from abundance; nourishment found in what was always ordinary; the body's own pace as the right pace.

Its heavier end: the pull of speed and noise even when you know better; service given from depletion rather than fullness; the restlessness before quiet becomes a companion rather than a confrontation.`,
};

// Per-territory facet seeds drawn from the range maps — one is picked
// randomly per generation to force the model into a different corner of
// the territory each time, rather than defaulting to the same most-likely
// interpretation. Covers both lighter and heavier ends of each range map.
const TERRITORY_FACET_SEEDS: Record<string, string[]> = {
  creativity_devotion_curiosity: [
    "making as prayer, as aliveness — showing up to create as an act of presence with no other agenda",
    "the thing made for no one — creation with no audience, no outcome, no justification",
    "the work that wants to exist and asks only to be listened to, not invented",
    "curiosity followed with nowhere particular to go — pure and agenda-free, just the pull",
    "devotion that feels like love rather than duty — returning to the work because you want to, not because you must",
    "the childlike wonder that precedes mastery and keeps outlasting it",
    "sensitivity and attention as the core creative capacities, not talent or technique",
    "ordinary moments as inexhaustible source material — the creative act of noticing",
    "the faint pull of an idea not yet understood — before it has words or shape",
    "creating from abundance rather than from need to prove, justify, or be seen",
    "the specific thing that keeps pulling attention uninvited, appearing in unrelated places",
    "the gap between what is made in private and what is allowed to be seen or called real",
    "creative block as self-protection — what it is guarding against, and what it knows",
    "devotion that has curdled into performance or obligation — the moment that shift happened",
    "the inquiry that keeps getting redirected — the question you almost let yourself investigate",
  ],
  healthy_masculinity_emotional_regulation: [
    "strength and tenderness as a single, non-contradictory thing — what that actually looks like in a moment",
    "the courage of being truly known by another person — not admired, not needed, known",
    "grief as a form of love rather than weakness — what that reframe opens up",
    "the body as a reliable compass — a specific signal it gave that you either trusted or overrode",
    "the moment you responded instead of reacted and felt the difference in your chest",
    "clear boundaries carried without apology, guilt, or over-explanation",
    "holding space for someone else because you've learned to hold it for yourself first",
    "emotional steadiness as a quiet form of leadership — presence without performance",
    "vulnerability that deepened connection rather than collapsed into shame",
    "masculine tenderness as something that doesn't need defending or explaining",
    "the warmth of letting a specific person actually know you — the risk and the relief of it",
    "integrity lived in a small, unglamorous moment — not declared, just done",
    "armor that once protected but now costs more than it gives",
    "a pattern inherited from men who couldn't show theirs — where it shows up in you",
    "performing strength while feeling nothing underneath — what that performance requires",
  ],
  inner_child_tending_expression: [
    "play as a legitimate adult capacity — what it looks like when you actually let it happen",
    "the specific dream that keeps returning despite being set aside long ago",
    "the feeling of being genuinely absorbed in something with no concern for outcome or time",
    "making something for no one and feeling the rightness of it — that particular freedom",
    "wonder at something ordinary — a quality of light, a turn of language, a moment that landed",
    "giving the younger version of yourself something specific it needed and didn't receive",
    "self-compassion as a practice of returning gently, not a destination to eventually arrive at",
    "the capacity to be moved by small things — what allows it and what closes it off",
    "being absorbed without agenda — when that state was last real, and what it required",
    "creativity as self-love — making as an act of care directed inward",
    "the wonder that precedes understanding — staying with something before you know what it is",
    "emotions as information to be met and listened to, not managed or redirected",
    "the parts of yourself that were silenced or hurried past — what they were trying to say",
    "grief for things that were never expressed — what they were, what they wanted",
    "the inner critic as a voice that was never really yours — where it came from, whose it was",
  ],
  slow_living_life_in_service: [
    "simplicity as a deliberate choice — what you released to get there, and what moved in when you did",
    "the specific pleasure of an unhurried morning — the texture of it, what makes it possible",
    "showing up fully to something small — what full presence in a minor moment actually feels like",
    "silence as a companion rather than an absence — when that shift happened",
    "slowness as a form of wisdom — something speed was keeping you from noticing",
    "the feeling of mattering to a specific person in a specific moment — what that exchange was",
    "contribution without performance — giving something when nobody was watching or counting",
    "being part of something larger without needing to name or explain it",
    "moving from self-discovery toward self-offering — the moment that direction became clear",
    "service that comes from abundance rather than depletion — what the difference feels like",
    "nourishment found in something that was always ordinary — what had to slow down for you to notice it",
    "the body's own pace — what it actually asks for when the day stops demanding",
    "the pull of speed and noise even when you know better — what still makes you reach for it",
    "the restlessness before quiet became a companion — what that transition required",
    "service given from depletion — the signals that name it, and what restores the source",
  ],
};

export function pickFacetSeed(territories: TerritoryInput[], previousPrompt?: string): string | null {
  const pool = resolveAllFacetSeeds(territories)
  if (pool.length === 0) return null
  if (!previousPrompt || pool.length === 1) {
    return pool[Math.floor(Math.random() * pool.length)]
  }
  // When regenerating, actively pick a seed that shares as few words as possible
  // with the previous prompt — forces a genuinely different corner of the territory.
  const prevWords = new Set(previousPrompt.toLowerCase().match(/\b\w{4,}\b/g) ?? [])
  const scored = pool.map((seed) => {
    const seedWords = seed.toLowerCase().match(/\b\w{4,}\b/g) ?? []
    const overlap = seedWords.filter((w) => prevWords.has(w)).length
    return { seed, overlap }
  })
  scored.sort((a, b) => a.overlap - b.overlap)
  // Pick randomly from the bottom third (lowest overlap) so there's still variety
  const cutoff = Math.max(1, Math.floor(scored.length / 3))
  const candidates = scored.slice(0, cutoff)
  return candidates[Math.floor(Math.random() * candidates.length)].seed
}

// Each arc as a directional force applied to a territory —
// what the arc DOES to the content, not what it names.
const ARC_VECTORS: Record<string, string> = {
  Breakaway:
    "Surface what in this territory has become a cage, obligation, or performance of a self that's no longer true. What needs to be released, questioned, or walked away from?",
  Beginning:
    "Find what's nascent, unlived, too tender to have fully formed — the thing that hasn't had permission yet, the first shy appearance of something trying to emerge.",
  Expansion:
    "Locate the edge being circled but not entered — where surface engagement exists but real depth keeps getting postponed. Where is the unexplored corner that keeps calling?",
  Integration:
    "Find two things running separately in this territory that are ready to meet and inform each other. What has been learned the hard way that wants to become part of how you live?",
};

// Energy steers two things independently: which end of the territory's
// range to draw the facet from, and the rendering tone of the output.
const ENERGY_FACET_STEER: Record<string, string> = {
  heavy:
    "Enter from the heaviest, most unflinching corner of the territory — where the gap between aspiration and reality is honestly felt, where something real and unresolved lives. Don't soften or redirect toward the light.",
  low: "Enter from the heaviest, most unflinching corner of the territory — where the gap between aspiration and reality is honestly felt, where something real and unresolved lives. Don't soften or redirect toward the light.",
  steady:
    "Draw from the full range of the territory — neither forcing shadow nor reaching for peak brightness. Find the corner that feels most honest and generative for where this territory actually lives.",
  light:
    "Enter from the expansive, forward-facing corners of the territory — where possibility is visible and the path feels genuinely open. Where this way of being starts to show what it can actually become.",
  bright:
    "Enter ONLY from the territory's most luminous, fully-inhabited corner — where this way of being is completely alive and the ceiling has already disappeared. STRICT RULE: Do not use heavy, deficit-based, or loss-adjacent facet seeds at all. If the chosen entry point touches struggle, suppression, apology, grief, shame, or what's been missing — ignore it entirely and find a facet that is already in the light: abundance, wonder, aliveness, full presence, the joy of making, the pull of something real. The question must BEGIN from radiance, not travel toward it through shadow. No 'what becomes possible once you stop X'. No negative framing as a launchpad. Start from what IS alive, not from what was taken away.",
};

const ENERGY_TONE_STEER: Record<string, string> = {
  heavy:
    "Render with unflinching, honest weight — not bleakness but the specific charge of a question that costs something to answer. The person reading it should feel: 'I've been circling this. I need to face it.' Not consoling, not hopeful — present and real. A different kind of catapult: into truth rather than creation. The question should feel like it was asked by someone who already knows what you've been avoiding.",
  low: "Render with unflinching, honest weight — not bleakness but the specific charge of a question that costs something to answer. The person reading it should feel: 'I've been circling this. I need to face it.' Not consoling, not hopeful — present and real. A different kind of catapult: into truth rather than creation. The question should feel like it was asked by someone who already knows what you've been avoiding.",
  steady:
    "Render with clear, grounded presence — neither heavy nor lifted. The question should feel worth sitting with: honest and specific enough not to slide off, but not carrying the full weight of shadow or the full charge of possibility. Substantial. Direct. The person reading it should feel: 'Yes, that's worth going into.'",
  light:
    "Render with warm, forward-facing energy — the feeling of a conversation that's just getting interesting and opening up. The question should create genuine want-to: not urgency, but the pull of something worth exploring. The person reading it should feel momentum building — like this could go somewhere real if they let it.",
  bright:
    "Render with charged, forward-surging wonder — the specific electricity of a door thrown open into a much larger room. The question must begin and end entirely in the positive: no deficit framing, no implied wound, no 'despite', no 'instead of', no shadow even at the edges. The person reading it should feel catapulted into creation not because they've been invited to heal something, but because the territory itself is ALIVE and already calling. Urgent without anxiety. Specific without being heavy. The question should feel like the one that makes a person stop everything and reach for a blank page right now — not because something is wrong, but because something is genuinely possible. The universe as active co-conspirator, the work as something already alive, the territory as abundance not absence. Not inspirational-poster bright: genuinely charged, alive, carrying real forward momentum.",
};

export function getRandomArcs(): string[] {
  const count = Math.random() > 0.5 ? 1 : Math.floor(Math.random() * 4) + 1;
  const shuffled = [...ALL_ARCS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getRandomTerritories(): string[] {
  const count = Math.random() > 0.5 ? 1 : Math.floor(Math.random() * 4) + 1;
  const shuffled = [...ALL_TERRITORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// ── The field register ──────────────────────────────────────────────────────
// Same four levers as the inner register (movement, territory, energy, mode),
// each rewritten for work that is judged by what it shows, argues or makes.

/** What a movement does to a field: its direction, in the field's own terms. */
const FIELD_ARC_VECTORS: Record<string, string> = {
  Breakaway:
    "Find the convention, default or received wisdom in this field that has stopped earning its place: the rule followed out of habit, the thing clients or audiences are told that no longer holds, the standard nobody has checked in years. What should be dropped, broken, or finally said out loud?",
  Beginning:
    "Find what is only just emerging in this field: a technique, material, format, audience or question too new to have rules yet. The first attempt, the untested approach, the thing practitioners are doing before anyone has named it.",
  Expansion:
    "Find the edge of current practice: where a known approach could be pushed much further than anyone takes it, or carried into a neighbouring field, scale or setting where it has never been tried.",
  Integration:
    "Find two things this field keeps apart: two techniques, two schools, craft and commerce, an old method and a new tool. What have they each learned that the other needs, and what does putting them together make possible?",
};

const FIELD_ENERGY_FACET_STEER: Record<string, string> = {
  heavy:
    "Enter from the field's heavier end: the constraint nobody escapes, the trade-off with no clean answer, the kind of failure that keeps happening, the thing practitioners know and rarely say in front of a client. Do not soften it or turn it toward a solution.",
  low: "Enter from the field's heavier end: the constraint nobody escapes, the trade-off with no clean answer, the kind of failure that keeps happening, the thing practitioners know and rarely say in front of a client. Do not soften it or turn it toward a solution.",
  steady:
    "Draw from the field's working middle: the everyday decisions and judgment calls where skill actually shows. Neither its crisis nor its frontier.",
  light:
    "Enter from where the field is opening up: something that works better than it should, an underused possibility, a small risk that would pay off.",
  bright:
    "Enter ONLY from the field's lighter end: the ambitious version, the what-if, the thing that would be a joy to attempt. Do not use problem, failure or constraint seeds at all; if the chosen entry point is one, set it aside and find a corner that begins from possibility. No 'what if we stopped X', no fixing something broken as the way in.",
};

const FIELD_ENERGY_TONE_STEER: Record<string, string> = {
  heavy:
    "Render with sober, clear-eyed weight: a question that takes the problem seriously and does not console in advance. The person reading it should feel: 'that is the real problem, and I have something to say about it.'",
  low: "Render with sober, clear-eyed weight: a question that takes the problem seriously and does not console in advance. The person reading it should feel: 'that is the real problem, and I have something to say about it.'",
  steady:
    "Render plainly and precisely, the way a sharp colleague asks across a table. The person reading it should feel: 'good question. I know where I stand, and I have never set it out.'",
  light:
    "Render with curiosity that leans forward: the feeling of a conversation about the work that has just become interesting. The person reading it should want to try the thing, or argue for it.",
  bright:
    "Render as a charged provocation or what-if, entirely in the positive: no problem framing, no 'despite', no 'instead of'. The person reading it should want to start making before they have finished answering. Ambitious and specific, never inspirational-poster bright.",
};

/** Every territory chosen is a field, none are, or both kinds are together. */
export function overallRegister(territories: TerritoryInput[]): Register | 'mixed' {
  const kinds = new Set(territories.map((t) => (typeof t === 'string' ? 'inner' : t.register ?? 'inner')))
  if (kinds.size === 2) return 'mixed'
  return kinds.has('field') ? 'field' : 'inner'
}

/**
 * Which model writes the nth ask in a row (0 = the first question, 1 = the
 * first "Ask again"). The first question and two more come from the fast
 * model; asking a third time means it is not landing, so the next three come
 * from the deep one, then three fast, three deep, and so on.
 */
export function promptModelTier(regeneration: number): 'fast' | 'deep' {
  if (!Number.isFinite(regeneration) || regeneration <= 2) return 'fast'
  return Math.floor((regeneration - 3) / 3) % 2 === 0 ? 'deep' : 'fast'
}

export interface PromptInput {
  arcs: string[]
  territories: TerritoryInput[]
  energy: string
  impersonal: boolean
  facetSeed: string | null
  /** Questions already turned down in this sitting, most recent last. */
  rejected: string[]
  /** Portrait and work in motion, already formatted. Empty when there is none or the mode is impersonal. */
  groundingBlock: string
  /** What they said they make at sign-up ("Cinematographer, Client projects"), or ''. */
  makes: string
  /** A field territory whose map was written before fields had their own maps. */
  looseMap?: boolean
}

export interface BuiltPrompt {
  system: string
  userMessage: string
  register: Register | 'mixed'
}

function divergence(rejected: string[]): string {
  const previousPrompt = rejected[rejected.length - 1]
  if (!previousPrompt) return ''
  const rule = `\n\nDo NOT rephrase, echo, or rhyme structurally with this. The new prompt must go somewhere entirely different: a different corner of the territory, a different subject within the facet, a different grammatical form, a different emotional register within the energy level. If the previous prompt was a "What would you tell..." question, do not write another one. If it opened with wonder, try specificity. If it addressed "people who X", address the act or the moment instead. Treat this as a hard divergence requirement — same settings, completely different door.\n`
  if (rejected.length === 1) return `\nREGENERATION — THE PREVIOUS PROMPT WAS REJECTED:\n"${previousPrompt}"${rule}`
  return `\nREGENERATION — THESE PROMPTS WERE ALL REJECTED (most recent last):\n${rejected.map((p) => `- "${p}"`).join('\n')}\n\nEvery one of them missed, so do not return to any of their subjects or shapes, and do not split the difference between them. Treat the most recent as the one to get furthest from.${rule}`
}

export function buildIdeaPrompt(input: PromptInput): BuiltPrompt {
  const register = overallRegister(input.territories)
  return register === 'field' ? buildField(input) : buildInner(input, register)
}

// The original builder, unchanged for inner territories. With both kinds
// chosen it gains one paragraph that stands the question on the field's ground.
function buildInner(input: PromptInput, register: 'inner' | 'mixed'): BuiltPrompt {
  const finalArcs = input.arcs
  const isImpersonal = input.impersonal
  const groundingBlock = input.groundingBlock
  const facetSeed = input.facetSeed
  const facetSteer = ENERGY_FACET_STEER[input.energy] ?? ENERGY_FACET_STEER.steady
  const toneSteer = ENERGY_TONE_STEER[input.energy] ?? ENERGY_TONE_STEER.steady
  const territoryNamesText = input.territories.map((t) => resolveTerritoryLabel(t)).join(", ")
  const territoryRangeMapsText = input.territories
    .map((t) => `${resolveTerritoryLabel(t)}:\n${resolveTerritoryRangeMap(t)}`)
    .join("\n\n")
  const fields = input.territories.filter((t) => typeof t !== 'string' && t.register === 'field').map(resolveTerritoryLabel)
  const mixedBlock =
    register === 'mixed'
      ? `\n\nMIXED GROUND: ${fields.join(", ")} ${fields.length === 1 ? "is a concrete field" : "are concrete fields"}, not an inner theme. Stand the question on that field's ground, using its real materials, decisions and people, and let the other territory supply what is at stake in it. One question, not one for each. Do not dissolve the field into metaphor.`
      : ''

  // Arc vectors — what the arc does to the territory, not what it names
  const arcSection =
    finalArcs.length > 0
      ? `THE ARC — its direction applied to the territory:\n${finalArcs.map((a) => `${a}: ${ARC_VECTORS[a] ?? ""}`).join("\n")}`
      : "NO ARC: Let the territory carry the whole prompt on its own terms. Do not impose any Breakaway / Beginning / Expansion / Integration framing. The question must be timeless — not situated in any particular life stage, transition, or moment of change. It should feel equally true and equally alive at any point in a human life.";

  // Territory range maps — the full field to roam inside
  const territorySection = territoryRangeMapsText
    ? `THE TERRITORY — its full range:\n${territoryRangeMapsText}`
    : "NO TERRITORY: Work from the arc alone, letting it find its own ground.";

  // Rendering mode — impersonal = Universal Question (writer as witness/philosopher/guide),
  // personal = Charged Question (writer as subject of their own lived experience).
  // Universal mode holds at every energy level — energy steers tone and which end of the
  // range to enter from, but the output is always outward-facing and principled.

  const renderingSection = isImpersonal
    ? `OUTPUT MODE — Universal Question:
Write one question that positions the writer as a witness to universal human experience — someone who has something to say to and about the world, not someone being asked to excavate their own biography.

OUTWARD-FACING: The question should address what is true for anyone who has ever lived inside this territory — what it teaches, what it asks of us, what it reveals about being human. Position the writer as guide, philosopher, or steward of a particular way of seeing: "What would you tell all the [people who have experienced X]...", "What does [territory] want from us collectively?", "What becomes possible when [principle]...", "What truth lives inside [experience] that almost no one names?". The writer is not the subject — their vision and understanding are the subject.

NOT personal memory. NOT "your" experience. The territory and arc are a compass into universal ground. The question should feel like the beginning of something the writer could say to strangers and have them recognize themselves in it.

One sentence. Always ends with a question mark. The writer should feel: "I have something to say about this that matters beyond my own story."`
    : `OUTPUT MODE — Charged Question:
Write one sentence. Always exactly one. A direct question that positions the writer as the only authority on the answer — the answer already lives inside them, the prompt just surfaces it. Usually begins with What, When, or Where (rarely Why — why invites justification, not felt truth). Can also be a directive: "Describe the last time..." or "Name the thing...". One question only. Land and stop. The person reading it should feel productive friction: "yes, that's it" followed by "I've never actually sat with that."

PERSONAL GROUNDING — use the context below to ground which specific facet the question lands on. Do not reference or quote it back; let it shape the targeting invisibly so the question feels like it could only have been written for this person. If no context is present, ground in the territory itself.

${groundingBlock}`;

  const divergenceBlock = divergence(input.rejected)

  const system = `You are Companheiro, generating a prompt that opens a door into the writer's relationship with the world.
${divergenceBlock}

${renderingSection}

${arcSection}

${territorySection}${mixedBlock}

ENERGY:
Facet — ${facetSteer}
Tone — ${toneSteer}
${facetSeed ? `\nFACET SEED — the corner of the territory to enter today:\n${facetSeed}\n${isImpersonal ? "Use this seed as a lens on universal human experience — let it show you WHICH corner of the territory to inhabit, then ask what is true for everyone who has ever lived there, not what the writer personally remembers. Do not restate the seed verbatim in the output." : "Enter from this specific corner. Do not restate the seed verbatim in the output — use it as the starting point, then let the arc's direction take it somewhere the seed alone doesn't name."}\n` : ""}
Find ONE specific, unexpected corner of this territory — shaped by the arc's direction and the energy's pull on the territory's range. Never restate the territory's own name or the arc's name inside the prompt. ${isImpersonal ? "If the question could be about one specific person's private story rather than a universal human truth, it is too narrow — go wider and more principled." : "If you can imagine the same prompt working unchanged for someone whose life looks entirely unlike who this was written for, go narrower and stranger."} A great prompt opens exactly one door, not a hallway.

Return only the prompt text. No quotation marks, no preamble, no explanation.`;

  const userMessage = [
    isImpersonal ? "Generate a universal question" : "Generate a charged question",
    finalArcs.length > 0 ? `rooted in: ${finalArcs.join(", ")}` : null,
    territoryNamesText ? `within the territory of: ${territoryNamesText}` : null,
  ]
    .filter(Boolean)
    .join(" ") + ".";

  return { system, userMessage, register }
}

function buildField(input: PromptInput): BuiltPrompt {
  const { arcs, territories, impersonal, facetSeed, groundingBlock, makes } = input
  const facetSteer = FIELD_ENERGY_FACET_STEER[input.energy] ?? FIELD_ENERGY_FACET_STEER.steady
  const toneSteer = FIELD_ENERGY_TONE_STEER[input.energy] ?? FIELD_ENERGY_TONE_STEER.steady
  const names = territories.map((t) => resolveTerritoryLabel(t)).join(", ")
  const maps = territories.map((t) => `${resolveTerritoryLabel(t)}:\n${resolveTerritoryRangeMap(t)}`).join("\n\n")

  const arcSection =
    arcs.length > 0
      ? `THE MOVEMENT — its direction applied to the field:\n${arcs.map((a) => `${a}: ${FIELD_ARC_VECTORS[a] ?? ""}`).join("\n")}`
      : "NO MOVEMENT: Let the field carry the whole prompt on its own terms. Do not impose any Breakaway / Beginning / Expansion / Integration framing, and do not tie the question to this year's news or tools: it should be as worth answering in ten years as it is today.";

  const makesLine = makes
    ? `\nWHAT THEY MAKE: ${makes}. Let this decide what kind of piece the question could turn into. Never name their profession in the question.`
    : ''

  const renderingSection = impersonal
    ? `OUTPUT MODE — A question about the field:
Write one question that asks for a position on the field itself: a claim to argue, a pattern to explain, a convention to weigh, a trade-off to settle. Anyone who knows the field well could answer it, and two of them would answer differently. The person is not the subject; their judgment is. Not "your" work, not their biography.

Ask it of the field, not of the reader: "Is...", "At what point does...", "What does ... owe ...", "Which ... ". Avoid "you" and "your".

One sentence. Always ends with a question mark. The person reading it should feel: "I have a view on this, and it is not the usual one."${makesLine}`
    : `OUTPUT MODE — A question from their own practice:
Write one sentence. Always exactly one. A question or a directive that sends them to something particular in their own work: one decision, one project, one object, one conversation, one habit of theirs that others in the field do not share. Usually begins with What, Which, When or Where, or is a directive: "Describe the last time...", "Name the rule you...". Rarely Why. They are the only authority on the answer, and it could not be answered by someone who has not done the work. Do not guess which seat they hold in the field (the one who makes it, sells it, commissions it, or writes about it) unless what they make or their work below says so: ask it so that anyone who works in or on this field answers from their own experience. Land and stop. The person reading it should feel: "I know exactly which job that was", then "I have never said out loud what I learned from it."${makesLine}
${groundingBlock ? `\nTHEIR WORK — use this only to aim the question at the kind of work they actually do. Do not reference or quote it back.\n\n${groundingBlock}\n` : ''}`;

  const system = `You are Companheiro, writing one question for someone who makes work in a concrete creative field. The question is where a piece of work starts: an essay, a film, a talk, a song, a campaign. It is not a journal prompt.
${divergence(input.rejected)}

${renderingSection}

${arcSection}

THE FIELD — its full range:
${maps}
${input.looseMap ? "\nThis map was written loosely, before the field was properly charted. Where it is vague or reaches for feeling, trust what you accurately know of the field instead.\n" : ""}
ENERGY:
Facet — ${facetSteer}
Tone — ${toneSteer}
${facetSeed ? `\nFACET SEED — the corner of the field to enter today:\n${facetSeed}\nEnter from this specific corner. Do not restate the seed in the output: use it as the starting point, then let the movement's direction take it somewhere the seed alone does not name.\n` : ""}
Find ONE specific, unexpected corner of this field, shaped by the movement's direction and the energy. Stand the question on the field's own ground: its materials, tools, formats, decisions and the people the work is made for, named the way someone who works in it names them. Never restate the territory's name or the movement's name inside the prompt.

What makes it good:
- It holds a tension, a stake or a claim. Two good practitioners would answer it differently, and either answer is the start of a piece.
- It could only be asked of this field. If another field's noun could be swapped in and the question still worked, go narrower.
- It is answered from judgment and experience, not from a textbook. No quiz questions, no requests for a how-to, no survey questions ("what is the future of...", "why does ... matter").
- It stays in the field's register. Do not turn it into a question about the person's feelings, healing, identity or soul, and do not reach for what the field "teaches us about being human". Feeling belongs in the question only where the work itself deals in it.
- It is short enough to hold in the head: 35 words at most, with at most one clause of setup before the question. If it needs explaining, it is the wrong question. Do not open with "When you" out of habit.
- Plain words, in the field's own vocabulary used correctly. No invented terms, no em dashes.

A great prompt opens exactly one door, not a hallway.

Return only the prompt text. No quotation marks, no preamble, no explanation.`;

  const userMessage = [
    impersonal ? "Generate a question about the field" : "Generate a question from their own practice",
    arcs.length > 0 ? `moving in the direction of: ${arcs.join(", ")}` : null,
    `within: ${names}`,
  ]
    .filter(Boolean)
    .join(" ") + ".";

  return { system, userMessage, register: 'field' }
}
