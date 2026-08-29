import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { MODELS } from "@/lib/models";
import { streamClaudeText } from "@/lib/streaming";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConceptualiseRequest {
  messages: Message[];
  phase: number;
  seed?: string;
  question?: string;
}

const PHASE_PROMPTS: Record<number, string> = {
  1: `You are meeting this idea for the first time. Your role is to:
- Receive the idea clearly — what it is, what it's actually about
- Mirror it back with precision, so they hear it freshly
- Ask one question about the idea itself, not about the person's relationship to it

The question should open outward: what is this an example of? what world does it point toward? Keep your response brief.`,

  2: `You are in the Expansion phase. Your role is to:
- Follow where this idea wants to go — where does it lead if you keep pulling?
- Find the unexpected connection, the surprising angle, the corner not yet named
- Ask one question that takes this somewhere bigger, stranger, or more specific than where it started

Ask only one question. Make it generative, not interrogative. You're following the idea, not interrogating the person.`,

  3: `You are in the Reader phase. Your role is to:
- Shift the perspective entirely: who receives this? What does a stranger — someone who doesn't know the writer — feel when they encounter this idea?
- Find the universal chord: what is this an example of that any human would recognize?
- Ask: what does this deliver to someone with no obligation to care about you personally?

Be concrete about the reader's experience. Help them see the idea from the outside.`,

  4: `You are in the Principle phase. Your role is to:
- Distil what this idea is actually about — the one true thing underneath all the versions
- Name the insight: what does this idea know? What does it show, reveal, or change for a reader?
- Ask: if this became a piece of work, what would a stranger carry away from it?

Guide them toward the principle, not the story. Universal over confessional.`,

  5: `You are in the Declaration phase. Your role is to:
- Invite them to name this idea as a piece that wants to exist
- Help them sense what form it wants to take — essay, short-form, a series, something else
- Receive their declaration with genuine recognition: this is real, this has shape, it can be made

Help them claim it — not just as a feeling, but as something to be made.`,
};

function shouldAdvancePhase(messages: Message[], phase: number): boolean {
  if (phase >= 5) return false;

  // Count exchanges in current phase (approximately)
  // Simple heuristic: if we have 4+ messages and are not in the first phase, advance
  const userMessagesInPhase = messages.filter((m) => m.role === "user").length;
  return userMessagesInPhase >= 2;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json(
        { response: "", phase: 1, readyToAdvance: false },
        { status: 401 }
      );
    }

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

    const companionContext = await buildCompanionContext(auth);

    const questionContext = body.question
      ? `\nTHE QUESTION THAT OPENED THIS:\n"${body.question}"\nThis is what the person was responding to when they started. Let it inform the shape of the conversation without quoting it back.`
      : '';

    const systemPrompt = `You are Companheiro, developing an idea with a creative person.

${COMPANION_TONE}

${companionContext ? companionContext + "\n\n" : ""}${PHASE_PROMPTS[nextPhase]}${questionContext}`;

    const claudeMessages: Message[] =
      body.messages.length > 0
        ? body.messages
        : [{ role: "user", content: "I'm here to develop an idea, but I'm starting from scratch." }];

    return streamClaudeText(
      {
        model: MODELS.deep,
        max_tokens: 400,
        system: systemPrompt,
        messages: claudeMessages,
      },
      () => ({
        phase: nextPhase,
        readyToAdvance: nextPhase === 5,
      })
    );
  } catch (error) {
    console.error("Conceptualise route error:", error);
    return NextResponse.json(
      { response: "", phase: 1, readyToAdvance: false },
      { status: 500 }
    );
  }
}
