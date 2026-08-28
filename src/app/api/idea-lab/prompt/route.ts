import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { MODELS } from "@/lib/models";
import { getActivePortrait, formatPortraitForPrompt } from "@/lib/portrait";

interface PromptRequest {
  arcs?: string[] | null;
  randomArcs?: boolean;
  territories?: string[] | null;
  randomTerritories?: boolean;
  energy?: string;
  impersonal?: boolean;
}

interface PromptResponse {
  prompt: string;
}

const ALL_ARCS = ["Breakaway", "Beginning", "Expansion", "Integration"];

const ALL_TERRITORIES = [
  "creativity_devotion_curiosity",
  "healthy_masculinity_emotional_regulation",
  "inner_child_tending_expression",
  "slow_living_life_in_service",
  "craft_making_form",
  "wonder_world_ideas",
  "the_human_universal",
];

const TERRITORY_LABELS: Record<string, string> = {
  creativity_devotion_curiosity: "Creativity, devotion & curiosity",
  healthy_masculinity_emotional_regulation: "Healthy masculinity & emotional regulation",
  inner_child_tending_expression: "Inner child tending & expression",
  slow_living_life_in_service: "Slow living & life in service",
  craft_making_form: "Craft & the made thing",
  wonder_world_ideas: "Wonder & the world's logic",
  the_human_universal: "What we share",
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

  craft_making_form: `What it means to make something as an act distinct from self-expression. The relationship between maker and material — what the material teaches, what the form demands, what the work knows that the maker didn't plan. Craft as a way of thinking, not just a medium for feeling. The ethics of attention: making something worthy of another person's limited time.

Contains: the constraint that became the piece — what the limitation taught that freedom couldn't; what a reader actually receives vs. what the maker intended; form as thinking rather than packaging — how shape changes meaning; revision as the real work; why certain things outlast their moment; the difference between expression and communication; what it means to make something universal without making it generic; the moment a piece becomes more than was planned.

Its lighter end: the joy of pure making; discovery in the doing; form as a kind of play; a piece coming alive in revision; craft as love for the reader; the made thing existing independently of its maker; making something worthy of a stranger's attention.

Its heavier end: the gap between ambition and execution; the piece that serves its maker more than it serves anyone else; the habit of making for approval rather than meaning; work that avoids what it should face; the question of whether this thing actually needs to exist.`,

  wonder_world_ideas: `Genuine intellectual curiosity about how things work — not as a personal exercise but as an orientation toward the world. Natural systems, human institutions, language, time, beauty, the hidden order underneath ordinary phenomena. The pleasure of following an idea past where you expected it to stop. Surprise as information. The world as endlessly strange when you look long enough.

Contains: the pattern that appears in two unrelated places; the observation that can't be unobserved; a natural system with unexpected elegance; what beauty might actually be doing as distinct from how it feels; the idea that seems obvious once stated and impossible before; language as a record of what people needed to say; the moment a familiar thing becomes strange; the insight that arrived from the wrong direction; the question that makes the room larger.

Its lighter end: pure delight in noticing; the pleasure of the unexpected connection; wonder without agenda; curiosity as a form of play; the world as inexhaustibly interesting; an idea following its own thread somewhere new.

Its heavier end: the question that exposes something uncomfortable; the pattern that explains something you'd rather not explain; the observation that changes what you see and can't be walked back; the idea whose implications go further than intended.`,

  the_human_universal: `Human experiences that any reader could recognize as true — not because they know you, but because they've been alive. Waiting, forgetting, the way time changes shape, what beauty does when it arrives unexpectedly, the structure of grief, how failure teaches things success conceals, the particular texture of belonging. The strangeness of being conscious at all.

Contains: the experience everyone has had but almost no one has named precisely; the principle that shows up differently in different lives but is unmistakably the same thing; the moment that has no visible importance but somehow stays; the emotion without a clean word for it; what kindness actually is when you look closely; the way memory edits; what presence feels like vs. what its absence costs; the ordinary rendered strange by attention.

Its lighter end: the beauty of recognition — this is true; the warmth of what connects us; ordinary life as rich source material; the principle that asks nothing personal of the writer; shared experience as a doorway into the universal.

Its heavier end: the human capacity to ignore what's in front of us; the ways we fail each other through inattention; what gets lost when we only speak from personal experience; the experience that feels too common to name — and why naming it actually matters.`,
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
  craft_making_form: [
    "the constraint that became the piece — what the limitation taught that freedom couldn't",
    "what a reader actually receives vs. what the maker intended to give",
    "form as thinking, not just packaging — the shape that changed the meaning",
    "revision as where the real work happens — the gap between the first version and the true one",
    "the piece that knew something the maker didn't — what it revealed by insisting on existing",
    "making something worthy of a stranger's attention — what that actually requires",
    "the difference between expressing yourself and making something for someone else",
    "why certain forms outlast their moment — what they knew about the reader",
    "the moment the work became more than was planned — what entered that wasn't invited",
    "craft as love made formal — what it means to finish something because the reader deserves it",
    "the piece that serves its maker more than it serves anyone else — how to tell the difference",
    "the gap between ambition and execution — what lives in that space and whether it's generative",
    "making for approval rather than meaning — when that shift happens and what it costs",
    "the work that avoids what it should face — how a piece betrays its own best subject",
    "whether this thing actually needs to exist — the question that clarifies everything else",
  ],
  wonder_world_ideas: [
    "the pattern that appears in two unrelated places — what that repetition is trying to say",
    "the observation that can't be unobserved — what you noticed that changed what you see",
    "the moment a familiar thing became strange — what shifted and why it stays shifted",
    "the insight that arrived from the wrong direction — what the surprise was actually teaching",
    "beauty as information — what beautiful things might be telling us beyond how they feel",
    "the question that makes the room larger — the one that opens rather than closes",
    "language as a record of what people needed to say — what a word's history reveals",
    "a natural system with unexpected elegance — what it teaches about design or order",
    "the idea that feels obvious once stated and impossible before — what that says about knowledge",
    "following an idea past where you expected it to stop — what's on the other side",
    "pure delight in noticing — what becomes visible when you're not looking for anything specific",
    "wonder without agenda — what curiosity feels like when it's not trying to arrive anywhere",
    "the question that exposes something uncomfortable — the idea whose implications go too far",
    "the pattern that explains something you'd rather not explain — what to do with that",
    "the observation that changes what you see and can't be walked back — its permanence",
  ],
  the_human_universal: [
    "the experience everyone has had but almost no one has named precisely — what that name would be",
    "the moment that has no visible importance but somehow stays — why memory kept it",
    "what beauty does when it arrives unexpectedly — the specific mechanism of being moved",
    "the emotion that doesn't have a clean word for it — what it would need a word to say",
    "what kindness actually is when you look closely — its exact structure and what it requires",
    "the way memory edits — what it selects and what that selection means",
    "what presence feels like vs. what its absence costs — the difference when you can name it",
    "the principle that shows up differently in different lives but is unmistakably the same thing",
    "the structure of grief — what it actually does and how it changes over time",
    "how failure teaches things that success conceals — what you can only learn by losing",
    "what time does when you're not paying attention — its texture in different kinds of waiting",
    "the particular texture of belonging — what it feels like from the inside and why it matters",
    "the strangeness of being conscious at all — the ordinary miracle that passes unnoticed",
    "the ways we fail each other through inattention — what missing someone who's present costs",
    "the experience that feels too common to name — and why naming it actually matters",
  ],
};

function pickFacetSeed(territories: string[]): string | null {
  const pool: string[] = territories.flatMap(
    (t) => TERRITORY_FACET_SEEDS[t] ?? []
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
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
    "Enter from the territory's most expansive, fully-inhabited corner — where this way of being is completely alive, not still being worked toward; where the grandest version of what's possible here becomes suddenly real and the ceiling disappears. If the facet seed touches something heavy, use it only as a launchpad: move through it in a single beat and take the prompt decisively toward what becomes possible on the other side. Never dwell in the weight when the energy is this high.",
};

const ENERGY_TONE_STEER: Record<string, string> = {
  heavy:
    "Render with unflinching, honest weight — not bleakness but the specific charge of a question that costs something to answer. The reader should feel: 'I've been circling this. I need to face it.' Not consoling, not hopeful — present and real. A different kind of catapult: into truth rather than creation. The question should feel like it was asked by someone who already knows what you've been avoiding.",
  low: "Render with unflinching, honest weight — not bleakness but the specific charge of a question that costs something to answer. The reader should feel: 'I've been circling this. I need to face it.' Not consoling, not hopeful — present and real. A different kind of catapult: into truth rather than creation. The question should feel like it was asked by someone who already knows what you've been avoiding.",
  steady:
    "Render with clear, grounded presence — neither heavy nor lifted. The question should feel worth sitting with: honest and specific enough not to slide off, but not carrying the full weight of shadow or the full charge of possibility. Substantial. Direct. The reader should feel: 'Yes, that's worth going into.'",
  light:
    "Render with warm, forward-facing energy — the feeling of a conversation that's just getting interesting and opening up. The question should create genuine want-to: not urgency, but the pull of something worth exploring. The reader should feel momentum building — like this could go somewhere real if they let it.",
  bright:
    "Render with charged, forward-surging wonder — not quiet awe but the specific electricity of a door thrown open into a much larger room. The prompt should feel like the one question that makes a person stop everything, put the phone down, and reach for their notebook right now. Urgent without anxiety. Alive with possibility at a scale that makes ordinary limitations feel suddenly irrelevant. Rubin's spirit in its most electrifying register: the universe as active co-conspirator, the work as something already alive and pulling toward the writer, not waiting to be invented. The reader should feel genuinely catapulted — out of stillness, into creation. Not inspirational-poster bright: specific, alive, and carrying real charge.",
};

function getRandomArcs(): string[] {
  const count = Math.random() > 0.5 ? 1 : Math.floor(Math.random() * 4) + 1;
  const shuffled = [...ALL_ARCS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getRandomTerritories(): string[] {
  const count = Math.random() > 0.5 ? 1 : Math.floor(Math.random() * 4) + 1;
  const shuffled = [...ALL_TERRITORIES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function POST(request: NextRequest): Promise<NextResponse<PromptResponse>> {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ prompt: "" }, { status: 401 });
    }

    const body: PromptRequest = await request.json();

    const arcsSkipped = body.arcs === null;
    if (!arcsSkipped && (!body.arcs || body.arcs.length === 0) && !body.randomArcs) {
      return NextResponse.json({ prompt: "" }, { status: 400 });
    }

    const finalArcs = arcsSkipped ? [] : body.randomArcs ? getRandomArcs() : body.arcs || [];

    // Resolve territories once — reused for range maps, names, and seed pick.
    const finalTerritories: string[] =
      body.territories === null
        ? []
        : body.randomTerritories
          ? getRandomTerritories()
          : body.territories ?? [];

    const territoryNamesText = finalTerritories
      .map((t) => TERRITORY_LABELS[t] || t)
      .join(", ");

    const territoryRangeMapsText = finalTerritories
      .map((t) => `${TERRITORY_LABELS[t] || t}:\n${TERRITORY_RANGE_MAPS[t] ?? ""}`)
      .join("\n\n");

    // One random facet seed from the resolved territories forces a different
    // corner of the range map each generation — prevents convergence.
    const facetSeed = pickFacetSeed(finalTerritories);

    const isImpersonal = body.impersonal === true;
    const energy = body.energy ?? "steady";
    const facetSteer = ENERGY_FACET_STEER[energy] ?? ENERGY_FACET_STEER.steady;
    const toneSteer = ENERGY_TONE_STEER[energy] ?? ENERGY_TONE_STEER.steady;

    // Portrait + active work context — only fetched in personal (charged) mode.
    // Grounds which specific facet the question lands on; stays invisible in output.
    let groundingBlock = "";
    if (!isImpersonal) {
      const { supabase, user } = auth;
      const [portraitEntries, { data: activePieces }, { data: queueIdeas }] = await Promise.all([
        getActivePortrait(auth),
        supabase
          .from("pieces")
          .select("title, arc, thematic_territory, stage")
          .eq("user_id", user.id)
          .neq("stage", "posted")
          .limit(8),
        supabase
          .from("ideas")
          .select("title, one_sentence, arc")
          .eq("user_id", user.id)
          .in("status", ["ready", "developing"])
          .limit(8),
      ]);

      const contextParts: string[] = [];
      const portraitBlock = formatPortraitForPrompt(portraitEntries);
      if (portraitBlock) contextParts.push(portraitBlock);

      if (activePieces && activePieces.length > 0) {
        contextParts.push(
          "WHAT'S ACTIVELY IN MOTION:\n" +
            activePieces
              .map((p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory})`)
              .join("\n")
        );
      }

      if (queueIdeas && queueIdeas.length > 0) {
        contextParts.push(
          "IDEAS ALREADY QUEUED:\n" +
            queueIdeas.map((i) => `- "${i.title}": ${i.one_sentence} (${i.arc})`).join("\n")
        );
      }

      groundingBlock = contextParts.join("\n\n");
    }

    // Arc vectors — what the arc does to the territory, not what it names
    const arcSection =
      finalArcs.length > 0
        ? `THE ARC — its direction applied to the territory:\n${finalArcs.map((a) => `${a}: ${ARC_VECTORS[a] ?? ""}`).join("\n")}`
        : "NO ARC: Let the territory carry the whole prompt on its own terms. Do not impose any Breakaway / Beginning / Expansion / Integration framing.";

    // Territory range maps — the full field to roam inside
    const territorySection = territoryRangeMapsText
      ? `THE TERRITORY — its full range:\n${territoryRangeMapsText}`
      : "NO TERRITORY: Work from the arc alone, letting it find its own ground.";

    // Rendering mode — impersonal = Open Invitation, personal = Charged Question
    const renderingSection = isImpersonal
      ? `OUTPUT MODE — Open Question:
Write one question. Spacious and open-ended — no single right answer, many possible directions the writer could take it. It should feel like an invitation rather than an interrogation: wide enough that the writer doesn't feel funneled toward one answer, but specific enough to land somewhere real inside the territory. One sentence. Always ends with a question mark.

IMPERSONAL: Nothing is known about who is asking and it must stay that way. Do not invent or assume anything personal. Explore the territory and arc purely on their own terms.`
      : `OUTPUT MODE — Charged Question:
Write one sentence. Always exactly one. A direct question that positions the writer as the only authority on the answer — the answer already lives inside them, the prompt just surfaces it. Usually begins with What, When, or Where (rarely Why — why invites justification, not felt truth). Can also be a directive: "Describe the last time..." or "Name the thing...". One question only. Land and stop. The reader should feel productive friction: "yes, that's it" followed by "I've never actually sat with that."

PERSONAL GROUNDING — use the context below to ground which specific facet the question lands on. Do not reference or quote it back; let it shape the targeting invisibly so the question feels like it could only have been written for this person. If no context is present, ground in the territory itself.

${groundingBlock}`;

    const system = `You are Companheiro, generating a prompt that opens a door into someone's lived experience.

${renderingSection}

${arcSection}

${territorySection}

ENERGY:
Facet — ${facetSteer}
Tone — ${toneSteer}
${facetSeed ? `\nFACET SEED — your required entry point into the territory today:\n${facetSeed}\nEnter from this specific corner. Do not restate the seed verbatim in the output — use it as the starting point, then let the arc's direction take it somewhere the seed alone doesn't name.\n` : ""}
Find ONE specific, unexpected corner of this territory — shaped by the arc's direction and the energy's pull on the territory's range. Never restate the territory's own name or the arc's name inside the prompt. If you can imagine the same prompt working unchanged for someone whose life looks entirely unlike who this was written for, go narrower and stranger. A great prompt opens exactly one door, not a hallway.

Return only the prompt text. No quotation marks, no preamble, no explanation.`;

    const userMessage = [
      isImpersonal ? "Generate an open invitation" : "Generate a charged question",
      finalArcs.length > 0 ? `rooted in: ${finalArcs.join(", ")}` : null,
      territoryNamesText ? `within the territory of: ${territoryNamesText}` : null,
    ]
      .filter(Boolean)
      .join(" ") + ".";

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 250,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ prompt: "" }, { status: 500 });
    }

    return NextResponse.json({ prompt: textContent.text.trim() });
  } catch (error) {
    console.error("Prompt generation error:", error);
    return NextResponse.json({ prompt: "" }, { status: 500 });
  }
}
