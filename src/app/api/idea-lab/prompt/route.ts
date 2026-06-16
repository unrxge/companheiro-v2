import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface PromptRequest {
  arcs: string[];
  territories?: string[];
}

interface PromptResponse {
  prompt: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<PromptResponse>> {
  try {
    const body: PromptRequest = await request.json();

    if (!body.arcs || body.arcs.length === 0) {
      return NextResponse.json(
        { prompt: "" },
        { status: 400 }
      );
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const arcsDescription = body.arcs.join(", ");
    const territoriesDescription = body.territories ? body.territories.join(", ") : "various territories";

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
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
          content: `Generate a prompt rooted in these arc(s): ${arcsDescription}. The prompt should be relevant to themes in: ${territoriesDescription}.`,
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
