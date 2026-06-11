import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface GenerateTasksRequest {
  piece_id: string;
  core_concept: {
    one_sentence: string;
    arc: string;
    conviction_statement: string;
    emotional_journey: string;
    core_truth: string;
    substack_goals: string;
    short_form_goals: string;
  };
}

interface GenerateTasksResponse {
  tasks: Array<{
    title: string;
    type: "creation" | "execution";
  }>;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<GenerateTasksResponse>> {
  try {
    const body: GenerateTasksRequest = await request.json();

    if (!body.piece_id || !body.core_concept) {
      return NextResponse.json({ tasks: [] }, { status: 400 });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const conceptSummary = `
Idea: ${body.core_concept.one_sentence}
Arc: ${body.core_concept.arc}
Conviction: ${body.core_concept.conviction_statement}
Core Truth: ${body.core_concept.core_truth}
Substack Goals: ${body.core_concept.substack_goals}
Short-form Goals: ${body.core_concept.short_form_goals}
    `;

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: `You are a creative project manager. Generate a task list for bringing an idea to publication.
The list should flow from initial writing through to posting, balancing creation work (writing, conceptualizing, experimenting) with execution work (editing, formatting, scheduling).
Each task should be concrete and specific.
Each task is labeled as either "creation" (conceptual/creative work) or "execution" (technical/logistical work).

Return as JSON:
{
  "tasks": [
    { "title": "...", "type": "creation" | "execution" },
    ...
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Generate a task sequence for this piece:\n${conceptSummary}`,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ tasks: [] }, { status: 500 });
    }

    try {
      const cleanedText = textContent.text.replace(/```json\n?|\n?```/g, "").trim();
      const result = JSON.parse(cleanedText);
      return NextResponse.json({
        tasks: result.tasks || [],
      });
    } catch (parseError) {
      console.error("Failed to parse tasks response:", parseError);
      return NextResponse.json({ tasks: [] }, { status: 500 });
    }
  } catch (error) {
    console.error("Generate tasks error:", error);
    return NextResponse.json({ tasks: [] }, { status: 500 });
  }
}
