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
    "Enter from the heavier end of the territory's range — the weightier, shadow-toned corners it contains. Meet in weight; don't force lightness.",
  low: "Enter from the heavier end of the territory's range — the weightier, shadow-toned corners it contains. Meet in weight; don't force lightness.",
  steady:
    "Draw from the full range of the territory — neither forcing shadow nor reaching for lightness. Let the arc and territory find their natural entry point together.",
  light:
    "Enter from the lighter end of the territory's range — the more expansive, hopeful, alive corners it contains.",
  bright:
    "Enter from the lightest, most luminous end of the territory's range — the corners that feel like relief, discovery, aliveness, or grace.",
};

const ENERGY_TONE_STEER: Record<string, string> = {
  heavy:
    "Render with tenderness and slowness. Do not rush toward resolution or lightness. The tone should feel like a hand extended in the dark — unhurried, present, holding.",
  low: "Render with tenderness and slowness. Do not rush toward resolution or lightness. The tone should feel like a hand extended in the dark — unhurried, present, holding.",
  steady: "Render with a clear, grounded tone. Neither heavy nor lifted. Present and direct.",
  light:
    "Render with a sense of expansion and momentum — a tone that feels open, forward-facing, alive with possibility.",
  bright:
    "Render in the spirit of Rick Rubin's creative mystique — quiet awe, almost aphoristic, as though the prompt arrives from somewhere larger than the writer. A sense of the universe as living source material; the self as receiver, not inventor. Spacious. Luminous. A tone that makes the ordinary feel sacred and the question feel like an invitation from life itself.",
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

    // Resolve territories to their range maps and display names
    let territoryRangeMapsText = "";
    let territoryNamesText = "";

    if (body.territories === null) {
      // skipped — no territory context
    } else if (body.randomTerritories) {
      const randomTerritories = getRandomTerritories();
      territoryNamesText = randomTerritories.map((t) => TERRITORY_LABELS[t]).join(", ");
      territoryRangeMapsText = randomTerritories
        .map((t) => `${TERRITORY_LABELS[t]}:\n${TERRITORY_RANGE_MAPS[t] ?? ""}`)
        .join("\n\n");
    } else if (body.territories && body.territories.length > 0) {
      territoryNamesText = body.territories.map((t) => TERRITORY_LABELS[t] || t).join(", ");
      territoryRangeMapsText = body.territories
        .map((t) => `${TERRITORY_LABELS[t] || t}:\n${TERRITORY_RANGE_MAPS[t] ?? ""}`)
        .join("\n\n");
    }

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
      ? `OUTPUT MODE — Open Invitation:
Write one line (two only if the second genuinely adds what the first cannot carry alone — one is almost always stronger). Create space rather than ask a question. No question mark. A statement or observation that opens something real inside the territory, drops it, and stops. The reader should feel: "I know exactly where I am in this" — and find themselves already writing.

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
