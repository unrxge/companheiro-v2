import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConceptualiseRequest {
  messages: Message[];
  phase: number;
  seed?: string;
}

interface ConceptualiseResponse {
  response: string;
  phase: number;
  readyToAdvance: boolean;
}

const PHASE_PROMPTS: Record<number, string> = {
  1: `You are guiding someone through the First Contact phase of idea development. Your role is to:
- Receive their idea without judgment
- Mirror it back to them clearly and distinctly
- Ask one open, generous question to begin exploring

Keep your response brief and warm. Show you understand what they've shared.`,

  2: `You are in the Excavation phase. Your role is to:
- Ask one deep, specific question that probes what's underneath the surface
- Follow the thread they're offering, responsive to what they've actually said
- Look for assumptions, drives, real needs

Ask only one question. Make it count. Be curious, not clinical.`,

  3: `You are in the Challenge phase. Your role is to:
- Present the opposite or polar view of their idea
- Play thoughtful devil's advocate
- Find the hard question their idea might be avoiding or glossing over

Don't be harsh, but be real. Help them see the other side clearly.`,

  4: `You are in the Clarification phase. Your role is to:
- Distil what they're saying to the single most important truth underneath
- Ask: Who is this for? What do they feel at the end?
- Move from concept to concrete impact

Guide them toward specificity and clarity.`,

  5: `You are in the Declaration phase. Your role is to:
- Invite them to commit to this idea in their own words
- Receive their declaration warmly and with genuine recognition
- Confirm they're ready and that this idea has shape

Be generous and affirming. Help them claim this.`,
};

function shouldAdvancePhase(messages: Message[], phase: number): boolean {
  if (phase >= 5) return false;

  // Count exchanges in current phase (approximately)
  // Simple heuristic: if we have 4+ messages and are not in the first phase, advance
  const userMessagesInPhase = messages.filter((m) => m.role === "user").length;
  return userMessagesInPhase >= 2;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ConceptualiseResponse>> {
  try {
    const body: ConceptualiseRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.phase < 1 || body.phase > 5) {
      return NextResponse.json(
        { response: "", phase: 1, readyToAdvance: false },
        { status: 400 }
      );
    }

    const currentPhase = body.phase;
    const shouldAdvance = shouldAdvancePhase(body.messages, currentPhase);
    const nextPhase = shouldAdvance ? Math.min(currentPhase + 1, 5) : currentPhase;

    const systemPrompt = PHASE_PROMPTS[nextPhase];

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build messages for Claude
    const claudeMessages: Message[] = body.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: systemPrompt,
      messages: claudeMessages,
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { response: "", phase: nextPhase, readyToAdvance: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      response: textContent.text,
      phase: nextPhase,
      readyToAdvance: nextPhase === 5,
    });
  } catch (error) {
    console.error("Conceptualise route error:", error);
    return NextResponse.json(
      { response: "", phase: 1, readyToAdvance: false },
      { status: 500 }
    );
  }
}
