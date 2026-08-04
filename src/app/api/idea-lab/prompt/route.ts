import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { MODELS } from "@/lib/models";
import { getActivePortrait, formatPortraitForPrompt } from "@/lib/portrait";

interface PromptRequest {
  arcs?: string[];
  randomArcs?: boolean;
  territories?: string[] | null;
  randomTerritories?: boolean;
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

// Randomly chosen per generation so repeated prompts land on genuinely
// different loose threads within the same territory, instead of the model's
// own sampling quietly converging on the same kind of facet each time.
const ENTRY_ANGLES = [
  "a specific, unremarkable ordinary moment where this quietly shows up, not the big dramatic version of it",
  "a contradiction — two things that are both true here and refuse to resolve into one",
  "a particular relationship or person this touches, without naming who",
  "a physical sensation in the body tied to this — where it's actually felt, not just thought",
  "the story or excuse someone tells themselves to avoid facing this directly",
  "an edge or extreme version of this that most people circling the same territory never actually reach",
  "a specific memory from one distinct period of life, not the theme in general",
  "a place or setting where this shows up sideways, uninvited, unrelated to the obvious context",
  "the gap between what this looks like from the outside and what it actually is on the inside",
  "the smallest, most specific, almost trivial detail that quietly carries the whole thing",
];

function getRandomAngle(): string {
  return ENTRY_ANGLES[Math.floor(Math.random() * ENTRY_ANGLES.length)];
}

export async function POST(request: NextRequest): Promise<NextResponse<PromptResponse>> {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ prompt: "" }, { status: 401 });
    }

    const body: PromptRequest = await request.json();

    if ((!body.arcs || body.arcs.length === 0) && !body.randomArcs) {
      return NextResponse.json(
        { prompt: "" },
        { status: 400 }
      );
    }

    const finalArcs = body.randomArcs ? getRandomArcs() : body.arcs || [];
    const arcsDescription = finalArcs.join(", ");

    let territoriesDescription: string;
    if (body.territories === null) {
      territoriesDescription = "";
    } else if (body.randomTerritories) {
      const randomTerritories = getRandomTerritories();
      territoriesDescription = randomTerritories
        .map((t) => TERRITORY_LABELS[t])
        .join(", ");
    } else if (body.territories && body.territories.length > 0) {
      territoriesDescription = body.territories
        .map((t) => TERRITORY_LABELS[t] || t)
        .join(", ");
    } else {
      territoriesDescription = "";
    }

    const { supabase, user } = auth;

    // Grounding, deliberately not check-ins: the confirmed Portrait (built
    // from conceptualise/zoom-out/writing too, not just check-ins) plus
    // what's actually in motion right now. Operational, not confrontational —
    // nothing here requires the person to have processed anything out loud.
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
          activePieces.map((p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory}, stage: ${p.stage})`).join("\n")
      );
    }

    if (queueIdeas && queueIdeas.length > 0) {
      contextParts.push(
        "IDEAS ALREADY QUEUED:\n" +
          queueIdeas.map((i) => `- "${i.title}": ${i.one_sentence} (${i.arc})`).join("\n")
      );
    }

    const groundingBlock = contextParts.length > 0 ? contextParts.join("\n\n") + "\n\n" : "";
    const angle = getRandomAngle();

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 220,
      system: `You are Companheiro, generating a creative prompt that invites someone deeper into their own unfolding.

${groundingBlock}Use the material above (when present) to ground the prompt in something specific and recognizable about this actual person — not to reference it directly or explain it back to them, just to make the specifics of the prompt feel like they could only be written for this person. If there's nothing above, ground it in the entry angle instead. Never treat this as a confrontation or ask them to process something — it's raw material for a concrete detail, nothing more.

The four arcs are:
- Breakaway: Disruption, stepping away from what no longer serves
- Beginning: Fresh starts, emergence, new possibilities
- Expansion: Growth, deepening, broadening horizons
- Integration: Synthesis, wholeness, bringing it together

A thematic territory (when given) is a wide field to roam inside, not the subject of the sentence. It names a general area — "creativity, devotion & curiosity," say — that touches dozens of specific, sometimes unrelated-looking corners: a discipline that curdled into obligation, a devotion nobody asked them to carry, curiosity they've been too tired to follow. Pick ONE such specific facet, tension, or unexpected corner within the territory for this prompt — never the territory's own words restated in a different order. If you can imagine the same prompt working for someone whose life looks nothing like the specifics you chose, it's still too generic — go narrower and stranger.

Generate one prompt that is:
- Specific and concrete, not generic
- Evocative and poetic, not clinical
- Rooted in the selected arc(s)
- Anchored in one particular facet of the territory, not a restatement of the territory itself
- One idea, plainly said — not several abstract clauses stacked into a single sentence
- Direct and tender (names the real thing, holds space for it)
- Invitational—pointing inward without softening
- Brief (1-2 sentences)

Return only the prompt text, nothing else.`,
      messages: [
        {
          role: "user",
          content: territoriesDescription
            ? `Generate a prompt rooted in these arc(s): ${arcsDescription}. Enter this wider territory through: ${angle}. Do not simply name or restate the territory itself: ${territoriesDescription}.`
            : `Generate a prompt rooted in these arc(s): ${arcsDescription}. Enter it through: ${angle}.`,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ prompt: "" }, { status: 500 });
    }

    return NextResponse.json({
      prompt: textContent.text.trim(),
    });
  } catch (error) {
    console.error("Prompt generation error:", error);
    return NextResponse.json(
      { prompt: "" },
      { status: 500 }
    );
  }
}
