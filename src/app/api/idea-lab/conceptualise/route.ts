import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { aiGate, pickModel } from "@/lib/billing/fair-use";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { MODELS } from "@/lib/models";
import { streamClaudeText } from "@/lib/streaming";
import { withLanguage } from "@/lib/language";
import { cacheLastMessage } from "@/lib/prompt-cache";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConceptualiseRequest {
  messages: Message[];
  phase: number;
  seed?: string;
  question?: string;
  /** The person arrived with an idea they already carry ("Bring an idea"). */
  brought?: boolean;
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

// Phases advance on content, not on message count: the model appends
// <phase_complete/> when the phase's question has actually been answered.
// A hard cap (four user turns per phase on average) keeps a stuck phase
// from lasting forever.
const PHASE_MARKER = "<phase_complete/>";
const MAX_USER_TURNS_PER_PHASE = 4;

function hitTurnCap(messages: Message[], phase: number): boolean {
  const userTurns = messages.filter((m) => m.role === "user").length;
  return userTurns >= phase * MAX_USER_TURNS_PER_PHASE;
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
    const gated = await aiGate(auth);
    if (gated) return gated;

    const body: ConceptualiseRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages) || body.phase < 1 || body.phase > 5) {
      return NextResponse.json(
        { response: "", phase: 1, readyToAdvance: false },
        { status: 400 }
      );
    }

    const currentPhase = body.phase;
    // Advance now if the previous assistant turn declared the phase complete
    // (the client keeps the marker in history), or if the cap was hit.
    // The marker no longer advances on the next request: the client is told to
    // move on in the same response that carries it (see the meta below), so it
    // already sends the new phase. Only the turn cap advances here.
    const shouldAdvance = currentPhase < 5 && hitTurnCap(body.messages, currentPhase);
    const nextPhase = shouldAdvance ? Math.min(currentPhase + 1, 5) : currentPhase;

    const companionContext = await buildCompanionContext(auth);

    const questionContext = body.question
      ? `\nTHE QUESTION THAT OPENED THIS:\n"${body.question}"\nThis is what the person was responding to when they started. Let it inform the shape of the conversation without quoting it back.`
      : '';

    // A brought idea has already been lived with — don't treat it as a raw
    // spark. Receive what's worked out, find what's still unresolved.
    const broughtContext = body.brought
      ? `\nTHE PERSON BROUGHT THIS IDEA WITH THEM:\nThey've already been carrying it, maybe for a while. Don't re-explain it to them or start it from zero. Receive what they've worked out, notice what's settled and what's still loose, and spend your questions on the loose parts. If a phase's work is already answered by what they brought, complete it quickly.`
      : '';

    // Stable across most of a conceptualise session — only companionContext
    // and the intro ever change turn to turn, and companionContext is itself
    // usually stable within one sitting (it's built from check-ins/pieces
    // that don't change minute to minute). Cached; the phase prompt below is
    // genuinely volatile (it changes as the phase advances) so it stays out.
    const stableSystemBlock = `You are Companheiro, developing an idea with a creative person.

${COMPANION_TONE}

${companionContext ? companionContext + "\n\n" : ""}PHASE COMPLETION: the conversation moves through fixed phases, and every question you ask must belong to the current phase. If the phase's work is not yet done, stay inside it — ask about the phase's subject only, and do not jump ahead. When the person has answered the phase's question with something real (not just acknowledged it), the phase is done: stop asking about it. Reply briefly to what they said, then ask the first question of the NEXT phase (described below), and end your reply with the exact marker ${PHASE_MARKER} on its own line. Never mention the marker or phases to the person. Do not emit the marker on the first turn of a phase.`;

    const nextPhaseBlock =
      nextPhase < 5
        ? `\n\nNEXT PHASE (only if you are emitting ${PHASE_MARKER} this turn — then your closing question must come from here, not from the current phase):\n${PHASE_PROMPTS[nextPhase + 1]}`
        : "";

    const volatileSystemBlock = `CURRENT PHASE:\n${PHASE_PROMPTS[nextPhase]}${nextPhaseBlock}${questionContext}${broughtContext}`;

    // body.messages already includes the fresh user turn just typed (the
    // client appends it before calling this route) — cache everything up to
    // but not including it, so the newest, never-reused turn isn't marked.
    const claudeMessages: MessageParam[] =
      body.messages.length > 0
        ? [...cacheLastMessage(body.messages.slice(0, -1)), body.messages[body.messages.length - 1]]
        : [{ role: "user", content: "I'm here to develop an idea, but I'm starting from scratch." }];

    return streamClaudeText(auth.user.id, 
      'idea-lab/conceptualise',
      {
        model: pickModel(auth, nextPhase <= 2 ? MODELS.fast : MODELS.deep),
        max_tokens: 400,
        system: [
          {
            type: "text",
            text: withLanguage(stableSystemBlock),
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
          { type: "text", text: volatileSystemBlock },
        ],
        messages: claudeMessages,
      },
      (fullText) => {
        const complete = fullText.includes(PHASE_MARKER);
        // On completion the reply already asks the next phase's question, so
        // the client moves to that phase now.
        const reportedPhase = complete ? Math.min(nextPhase + 1, 5) : nextPhase;
        return {
          phase: reportedPhase,
          readyToAdvance: reportedPhase === 5,
          phaseComplete: complete,
        };
      }
    );
  } catch (error) {
    console.error("Conceptualise route error:", error);
    return NextResponse.json(
      { response: "", phase: 1, readyToAdvance: false },
      { status: 500 }
    );
  }
}
