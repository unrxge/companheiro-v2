import { NextRequest, NextResponse } from "next/server";
import { requireUser, type AuthedContext } from "@/lib/supabase/route";
import { aiGate, pickModel } from "@/lib/billing/fair-use";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { MODELS } from "@/lib/models";
import { META_DELIMITER, streamClaudeText } from "@/lib/streaming";
import { anthropic } from "@/lib/anthropic";
import { logUsage } from "@/lib/usage-log";
import { withLanguage } from "@/lib/language";
import { cacheLastMessage } from "@/lib/prompt-cache";
import {
  briefFloor,
  briefStableBlock,
  briefTool,
  briefVolatileBlock,
  parseBriefTurn,
  personFirst,
} from "@/lib/concept-brief";
import { BROUGHT_CONTEXT, conceptualisePhaseBlock, conceptualiseStableBlock, hitTurnCap, mergeTurns, MOVE_ON_NOTE, OPENING_NOTE, PHASE_MARKER, settleTurn } from "@/lib/conceptualise-prompt";
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
  /** The person is arriving from a check-in that surfaced creative energy. */
  checkInHandover?: boolean;
  /** This idea is becoming another piece of a project that already exists.
   *  The conversation is told what it is joining. */
  projectId?: string;
  /** With `projectId`: not a new piece but the project's own core concept,
   *  built late for a project started without one. A short brief taken from
   *  someone who already knows the idea (lib/concept-brief.ts). */
  brief?: boolean;
  /** With `brief`: the stages already asked twice (lib/concept-brief's follow-ups). */
  followedUp?: number[];
  /** The person pressed "Move on": no new message, the next phase begins. */
  moveOn?: boolean;
}

/**
 * What a new piece is joining, for the system prompt: the project's name, what
 * it is for, the rules it works under and the pieces already in it. Best
 * effort — a project that cannot be read just means the conversation runs as
 * it always did.
 */
async function projectBeingJoined(auth: AuthedContext, projectId: string): Promise<string> {
  const { data: project } = await auth.supabase
    .from("studio_projects")
    .select("title, intent, rules")
    .eq("id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!project) return "";

  const { data: siblings } = await auth.supabase
    .from("studio_nodes")
    .select("title")
    .eq("project_id", projectId)
    .eq("user_id", auth.user.id)
    .is("parent_id", null)
    .order("position", { ascending: true })
    .limit(12);

  const rules = Array.isArray(project.rules)
    ? (project.rules as Array<{ text?: string; retired_at?: string | null }>)
        .filter((r) => r && !r.retired_at && r.text)
        .map((r) => `- ${r.text}`)
    : [];
  const named = (siblings ?? [])
    .map((n) => (n as { title: string | null }).title?.trim())
    .filter((x): x is string => !!x);

  return `\nTHIS PIECE IS JOINING A PROJECT THAT ALREADY EXISTS:
Project: ${project.title || "untitled"}${project.intent ? `\nWhat the project is for: ${project.intent}` : ""}${named.length ? `\nThe pieces already in it: ${named.join("; ")}` : ""}${rules.length ? `\nThe rules it works under:\n${rules.join("\n")}` : ""}

Hold this as the room the idea is walking into, not as a brief to satisfy. Do not ask how the piece will fit, sit alongside the others, or serve the project — a piece that pulls against the vision is worth having, and the rules are checked separately once it is written down. Use it only to avoid asking what is already settled, and to notice when this idea is really the same one as a piece that exists — if it is, say so plainly, once.`;
}

/**
 * One turn of the short brief. The person already knows what the project is,
 * so this is a different job from the conversation below: no companion
 * context (the brief is about this project and nothing else, and it is read
 * and answered fast), one plain question per stage, a follow-up only where an
 * answer has nothing specific at its root, and a stage their words have
 * already settled is skipped. The deep model, because deciding whether an
 * answer has a root is a judgement the fast one makes badly.
 *
 * The stage is not read out of the prose. The model is made to call
 * `brief_turn`, naming the stage its line asks, and the page moves to that
 * stage (never earlier than lib/concept-brief's floor). The reply goes back in
 * the same shape a stream does (words, then the meta frame), so the page is
 * the same page; a line this short is all there at once.
 */
async function briefTurn(
  auth: AuthedContext,
  messages: Message[],
  phase: number,
  projectId: string,
  followedUp: number[]
): Promise<Response> {
  const floor = briefFloor(phase, followedUp);

  const { data: project } = await auth.supabase
    .from("studio_projects")
    .select("title, intent")
    .eq("id", projectId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  const turns = personFirst(messages);
  const claudeMessages: MessageParam[] = [
    ...cacheLastMessage(turns.slice(0, -1) as MessageParam[]),
    turns[turns.length - 1] as MessageParam,
  ];

  const tool = briefTool(floor);
  const response = await anthropic.messages.create({
    model: pickModel(auth, MODELS.deep),
    max_tokens: 400,
    system: [
      {
        type: "text",
        text: withLanguage(briefStableBlock(COMPANION_TONE)),
        cache_control: { type: "ephemeral", ttl: "1h" },
      },
      { type: "text", text: briefVolatileBlock({ phase, followedUp, project }) },
    ],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: claudeMessages,
  });
  logUsage(auth.user.id, "idea-lab/conceptualise", response.model, response.usage, { phase: floor, brief: true });

  const call = response.content.find((block) => block.type === "tool_use");
  const turn = parseBriefTurn(call && call.type === "tool_use" ? call.input : null, { phase, floor });
  if (!turn) {
    console.error("Brief turn came back with nothing to say:", response.stop_reason);
    return NextResponse.json({ response: "", phase, readyToAdvance: false }, { status: 502 });
  }

  const meta = {
    phase: turn.phase,
    readyToAdvance: turn.readyToAdvance,
    phaseComplete: turn.phaseComplete,
    followedUp: turn.followUp ? [...followedUp, phase] : followedUp,
  };
  return new Response(turn.say + META_DELIMITER + JSON.stringify(meta), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
  });
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

    // "Build the core concept" for a project started without one: a short
    // brief, not the full conversation. Nothing else below applies to it.
    if (body.brief && body.projectId) {
      const followedUp = (Array.isArray(body.followedUp) ? body.followedUp : []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 4).slice(0, 4);
      return await briefTurn(auth, body.messages, body.phase, body.projectId, followedUp);
    }

    body.messages = mergeTurns(body.messages);
    const currentPhase = body.phase;
    // Advance now if the previous assistant turn declared the phase complete
    // (the client keeps the marker in history), or if the cap was hit.
    // The marker no longer advances on the next request: the client is told to
    // move on in the same response that carries it (see the meta below), so it
    // already sends the new phase. Only the turn cap advances here.
    const shouldAdvance = currentPhase < 5 && (body.moveOn === true || hitTurnCap(body.messages, currentPhase));
    const nextPhase = shouldAdvance ? Math.min(currentPhase + 1, 5) : currentPhase;

    const companionContext = await buildCompanionContext(auth);

    // Joining a project that already has a vision and, often, rules. The
    // conversation has to know what it is standing beside: a piece worked out
    // in ignorance of the project around it is the one thing this step should
    // never produce. It is told, and told not to make the piece obedient —
    // a piece that pulls against the vision is worth having, and is checked
    // against the rules when it is saved.
    const joining = body.projectId ? await projectBeingJoined(auth, body.projectId) : "";

    const questionContext = body.question
      ? `\nTHE QUESTION THAT OPENED THIS:\n"${body.question}"\nThis is what the person was responding to when they started. Let it inform the shape of the conversation without quoting it back.`
      : '';

    // A brought idea has already been lived with — don't treat it as a raw
    // spark. Receive what's worked out, find what's still unresolved.
    const broughtContext = body.brought ? BROUGHT_CONTEXT : ''

    // The first user message contains the full check-in conversation. Use it
    // to do a warm handover: name the creative spark that surfaced there and
    // open Phase 1 from that specific place — don't summarise or reflect the
    // check-in back, just step through the door it opened.
    const checkInHandoverContext = body.checkInHandover
      ? `\nARRIVING FROM A CHECK-IN:\nThe first message contains what the person just shared in their check-in, in full. Read it and find what is alive — the specific thing that feels worth making into something. Your opening response should do three things: name what you noticed from the check-in that wants to become a piece of work, acknowledge the transition from reflection into making (briefly, without ceremony), and open Phase 1 from that exact place with one question about the idea itself. Do not summarise or recite the check-in back. Do not mention that you read a check-in — just begin where it left off.`
      : '';

    // Stable across most of a conceptualise session — only companionContext
    // and the intro ever change turn to turn, and companionContext is itself
    // usually stable within one sitting (it's built from check-ins/pieces
    // that don't change minute to minute). Cached; the phase prompt below is
    // genuinely volatile (it changes as the phase advances) so it stays out.
    const stableSystemBlock = conceptualiseStableBlock(COMPANION_TONE, companionContext);

    const volatileSystemBlock = `${conceptualisePhaseBlock(nextPhase)}${questionContext}${broughtContext}${checkInHandoverContext}${joining}`;

    // body.messages already includes the fresh user turn just typed (the
    // client appends it before calling this route) — cache everything up to
    // but not including it, so the newest, never-reused turn isn't marked.
    // "Move on" sends no new message: the conversation so far, then a note the
    // person never sees asking for the next phase's first question.
    const claudeMessages: MessageParam[] =
      body.moveOn && body.messages.length > 0
        ? [...cacheLastMessage(body.messages), { role: "user", content: MOVE_ON_NOTE }]
        : body.messages.length > 0
          ? [...cacheLastMessage(body.messages.slice(0, -1)), body.messages[body.messages.length - 1]]
          : [{ role: "user", content: "I'm here to develop an idea, but I'm starting from scratch." }];
    const model = pickModel(auth, MODELS.concept);
    const extras = `${questionContext}${broughtContext}${checkInHandoverContext}${joining}`;

    return streamClaudeText(auth.user.id, 
      'idea-lab/conceptualise',
      {
        model,
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
      async (fullText) => {
        // Every reply has to leave the person a way on: a question, or the
        // declaration. One that asked nothing moves the conversation on, and
        // the next phase's first question is written now and sent with it.
        const settled = settleTurn(fullText, nextPhase);
        let nextQuestion = "";
        if (settled.needsQuestion) {
          try {
            const res = await anthropic.messages.create({
              model,
              max_tokens: 200,
              system: [
                { type: "text", text: withLanguage(stableSystemBlock), cache_control: { type: "ephemeral", ttl: "1h" } },
                { type: "text", text: `${conceptualisePhaseBlock(settled.phase)}${extras}` },
              ],
              messages: [
                ...claudeMessages,
                { role: "assistant", content: fullText.split(PHASE_MARKER).join("").trim() || "…" },
                { role: "user", content: OPENING_NOTE },
              ],
            });
            logUsage(auth.user.id, "idea-lab/conceptualise", res.model, res.usage, { phase: settled.phase, opening: true });
            const text = res.content.find((b) => b.type === "text");
            const asked = text && text.type === "text" ? text.text.split(PHASE_MARKER).join("").trim() : "";
            // Only a question will do here; anything else and the Move on button is the way forward.
            if (/[?？¿]/.test(asked)) nextQuestion = asked;
          } catch (err) {
            console.error("Conceptualise opening question failed:", err);
          }
        }
        return {
          phase: settled.phase,
          readyToAdvance: settled.phase === 5,
          phaseComplete: settled.complete,
          ...(nextQuestion ? { nextQuestion } : {}),
        };
      },
      { phase: nextPhase }
    );
  } catch (error) {
    console.error("Conceptualise route error:", error);
    return NextResponse.json(
      { response: "", phase: 1, readyToAdvance: false },
      { status: 500 }
    );
  }
}
