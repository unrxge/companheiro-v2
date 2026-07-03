import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { MODELS } from "@/lib/models";

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

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 200,
      system: `You are Companheiro, generating a creative prompt that invites someone deeper into their own unfolding.

The four arcs are:
- Breakaway: Disruption, stepping away from what no longer serves
- Beginning: Fresh starts, emergence, new possibilities
- Expansion: Growth, deepening, broadening horizons
- Integration: Synthesis, wholeness, bringing it together

Generate one prompt that is:
- Specific and concrete, not generic
- Evocative and poetic, not clinical
- Rooted in the selected arc(s)
- Direct and tender (names the real thing, holds space for it)
- Invitational—pointing inward without softening
- Brief (1-2 sentences)

Return only the prompt text, nothing else.`,
      messages: [
        {
          role: "user",
          content: territoriesDescription
            ? `Generate a prompt rooted in these arc(s): ${arcsDescription}. The prompt should be relevant to themes in: ${territoriesDescription}.`
            : `Generate a prompt rooted in these arc(s): ${arcsDescription}.`,
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
