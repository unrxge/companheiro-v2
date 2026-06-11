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
      system: `You are a creative prompt generator rooted in personal transformation. Your role is to generate one specific, evocative prompt that points inward and is grounded in the selected arc(s) of creative and personal development.

The four arcs are:
- Breakaway: Disruption, stepping away from what no longer serves
- Beginning: Fresh starts, emergence, new possibilities
- Expansion: Growth, deepening, broadening horizons
- Integration: Synthesis, wholeness, bringing it together

Generate a prompt that is:
- Specific and concrete, not generic
- Evocative and poetic, not clinical
- Rooted in the selected arc(s)
- Invitational, pointing inward
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
