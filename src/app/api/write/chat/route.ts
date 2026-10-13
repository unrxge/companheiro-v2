import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { aiGate, pickModel } from "@/lib/billing/fair-use";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { PROSE_STANDARD, STORY_STRUCTURE } from "@/lib/writing-craft";
import { MODELS } from "@/lib/models";
import { recallEchoes } from "@/lib/recall";
import { streamClaudeText } from "@/lib/streaming";
import { withLanguage } from "@/lib/language";
import { cacheLastMessage } from "@/lib/prompt-cache";
import { ASSISTANT_INTRO, assistantRules } from "@/lib/writing-assistant-rules";
import { normaliseRules } from "@/lib/studio/nodes-db";
import { proposeRules, type RuleProposal } from "@/lib/studio/rule-proposals";
import { nodeGate } from "@/lib/studio/plan-access";

interface ActiveSection {
  id: string;
  label: string | null;
  intended_emotion: string | null;
  content: string;
  is_locked: boolean;
  anchor_lines?: string[];
}

interface PrecedingSection {
  label: string | null;
  content: string;
  anchor_lines?: string[];
}

interface ChatRequest {
  message: string;
  node_id: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  active_section?: ActiveSection | null;
  preceding_sections?: PrecedingSection[];
  selected_text?: string | null;
}

// A long session used to resend every exchange on every reply, so turn 40
// paid for turns 1–39 again. The window keeps the most recent 10–17
// exchanges and moves in blocks of 16 messages, not one at a time, so the
// cached prefix survives eight exchanges between trims instead of being
// rebuilt on every reply. What falls out of the window is still largely in
// the draft itself, which is always sent.
const HISTORY_KEEP = 20
const HISTORY_STEP = 16

function trimHistory<T extends { role: string }>(history: T[]): { messages: T[]; trimmed: boolean } {
  const drop = Math.floor(Math.max(0, history.length - HISTORY_KEEP) / HISTORY_STEP) * HISTORY_STEP
  let messages = history.slice(drop)
  // The API needs the conversation to open on a user turn.
  while (messages.length && messages[0].role !== 'user') messages = messages.slice(1)
  return { messages, trimmed: messages.length < history.length }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ response: "" }, { status: 401 });
    }
    const gated = await aiGate(auth);
    if (gated) return gated;

    const body: ChatRequest = await request.json();

    if (!body.message || !body.node_id) {
      return NextResponse.json({ response: "" }, { status: 400 });
    }
    const notActive = await nodeGate(auth, body.node_id)
    if (notActive) return notActive

    const { supabase, user } = auth;

    const [{ data: pieceRow, error: pieceError }, { data: settingsData }] = await Promise.all([
      supabase
        .from("studio_nodes")
        .select(
          "title, intent, emotional_journey, core_truth, open_threads, body, writing_ethos, rules, project_id"
        )
        .eq("id", body.node_id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("user_settings")
        .select("assistant_write_locked_until")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (pieceError || !pieceRow) {
      return NextResponse.json({ response: "" }, { status: 404 });
    }
    const pieceData = { ...pieceRow, conviction_statement: pieceRow.intent };


    const [companionContext, echoes, { data: projectRow }] = await Promise.all([
      buildCompanionContext(auth),
      recallEchoes(auth, `${pieceData.title || ""} ${body.message}`),
      // The project carries the half of the core concept that isn't on the
      // piece: its theme, its vision, and the rules the person set for it.
      supabase
        .from("studio_projects")
        .select("intent, thematic_territory, rules")
        .eq("id", pieceRow.project_id)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const section = body.active_section;
    // There are no modes any more: the assistant guides, and writes only on a
    // direct order (lib/writing-assistant-rules.ts). The lock can no longer be
    // set, but one a person put on themselves is kept until it runs out.
    const lockedUntil = settingsData?.assistant_write_locked_until ?? null;
    const isLocked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
    const selectedText = body.selected_text || null;
    // A change to the text can be offered as a pending edit only into an open, focused section.
    const canEdit = !!section && !section.is_locked && !isLocked;

    const precedingSections = (body.preceding_sections || []).filter(
      (s) => s.content?.trim() || (s.anchor_lines && s.anchor_lines.length > 0)
    );
    const precedingBlock =
      precedingSections.length > 0
        ? `THE PIECE SO FAR (everything already written before this section, in order — read it before you say or propose anything, and match its established tone, voice, and storyline; do not restate or repeat it):
${precedingSections
  .map((s, i) => {
    const anchorPart =
      s.anchor_lines && s.anchor_lines.length > 0
        ? `\nAnchor lines allocated here: ${s.anchor_lines.map((l) => `"${l}"`).join("; ")}`
        : "";
    return `[${s.label || `Section ${i + 1}`}]\n${s.content || "(not written yet)"}${anchorPart}`;
  })
  .join("\n\n")}`
        : "Nothing has been written before this section yet — it's the opening.";

    const sectionBlock = section
      ? `THE SECTION THEY'RE FOCUSED ON RIGHT NOW:
Label: ${section.label || "(untitled)"}${section.intended_emotion ? `\nIntended feeling: ${section.intended_emotion}` : ""}
Locked: ${section.is_locked ? "yes — you may discuss it but must NOT propose changes to it" : "no"}${
          section.anchor_lines && section.anchor_lines.length > 0
            ? `\nAnchor lines allocated here (precious to them — weave these in naturally, never ignore or drop them):\n${section.anchor_lines.map((l) => `- "${l}"`).join("\n")}`
            : ""
        }
Current text:
"""
${section.content || "(empty)"}
"""${
        selectedText
          ? `\n\nSELECTED SENTENCE / PASSAGE (they highlighted this specific text — this is what the conversation is primarily about; treat it as the exact focus of the discussion, not the whole section). This is the verbatim, current, on-the-page text — you already have it in full below; never ask them to paste it in or re-share it, that's exactly what this block is for:
"""
${selectedText}
"""`
          : ""
      }`
      : "They aren't focused on a specific section right now — keep it general.";

    const editInstructions = assistantRules({
      canPlace: canEdit,
      whyNot: !section ? "no-section" : section.is_locked ? "locked-section" : undefined,
      selectedText,
      lockedUntil: isLocked ? lockedUntil : null,
    });

    const modeIntro = ASSISTANT_INTRO;

    // Stable across an entire writing session — this string is usually
    // byte-identical from one chat turn to the next, since it only changes
    // when the piece's own fields or its preceding sections actually change.
    // Cached at the 1h TTL (prompt-cache.ts) so pausing to think between
    // messages doesn't mean rebuilding and rebilling all of this every turn.
    const liveRules = (raw: unknown) =>
      normaliseRules(raw).filter((r) => !r.retired_at).map((r) => r.text);
    const rules = [...liveRules(projectRow?.rules), ...liveRules(pieceRow.rules)];
    const openThreads = Array.isArray(pieceRow.open_threads)
      ? (pieceRow.open_threads as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const projectVision = projectRow?.intent?.trim() && projectRow.intent.trim() !== pieceData.conviction_statement?.trim()
      ? projectRow.intent.trim()
      : null;
    const conceptLines = [
      `Title: ${pieceData.title || "(untitled)"}`,
      projectRow?.thematic_territory ? `Theme: ${projectRow.thematic_territory}` : null,
      `Conviction — what the piece is for: ${pieceData.conviction_statement || "(not provided)"}`,
      projectVision ? `The project's wider vision: ${projectVision}` : null,
      `Core truth — the thing underneath it: ${pieceData.core_truth || "(not provided)"}`,
      `Emotional journey — the path the audience should travel, beat by beat:\n${pieceData.emotional_journey || "(not provided)"}`,
      pieceData.writing_ethos ? `Their ethos for it: ${pieceData.writing_ethos}` : null,
      openThreads.length ? `Open threads they left themselves to explore:\n${openThreads.map((x) => `- ${x}`).join("\n")}` : null,
      rules.length ? `Rules they set for this work (hold to these unless they change them; when something they now say they want runs against one, put the rule and their words side by side and ask which stands, the work or the rule, without deciding for them):\n${rules.map((x) => `- ${x}`).join("\n")}` : null,
    ].filter(Boolean).join("\n");

    const stableSystemBlock = `You are Companheiro, sitting beside a writer while they work on a piece.

${COMPANION_TONE}

${PROSE_STANDARD}

${STORY_STRUCTURE}

${companionContext ? companionContext + "\n\n" : ""}THE CORE CONCEPT — the document they built before writing a word. It is the brief for everything you say here:
${conceptLines}

HOW THE CONCEPT SHAPES YOU:
- Read every question, every section and every line through it. Before you answer, know which part of the concept is in play: which beat of the journey this section carries, which rule applies, how it serves the conviction and the core truth.
- Your observations measure the writing against their own intentions, not against a generic idea of good writing. "This paragraph is doing what the second beat asks — the audience feels the doubt before it's named" is worth more than any craft note that would be true of any piece.
- Name the concept when it's what's actually at stake, in their own words: the beat, the truth. Don't recite it back or tick through it like a checklist; once it's in play, let it inform the reply rather than headline it.
- When the writing drifts from the concept, say so — it's often the most useful thing you can notice. Then leave open which one should move: sometimes the draft has found something truer than the plan, and the concept is what needs revising. Their conviction outranks the document; the document is how you know what the conviction was.
- Anything you write or propose must serve the concept: it carries the beat this section is meant to carry, honours their rules, and moves toward the core truth rather than around it. If a line you're tempted to offer doesn't, don't offer it.
- An open thread they left themselves is theirs to pick up. When a moment in the draft is where one could be woven in, point at it once; never push.

${precedingBlock}

RESPONSE DISCIPLINE:
- Match response length and complexity to what was actually asked. A question about one line gets a focused reply about that line — not an essay. A small thing deserves a small answer.
- One question maximum per response, and only when it genuinely opens something. Not every response needs a question. Sometimes the right move is to name something and leave it there.
- Never stack questions. If three things are worth asking, pick the one that matters most right now and let the conversation surface the others naturally.

DELIVERING CRITIQUE — you are beside the writer, not above them:
- Observations, not verdicts. "I wonder if there's a version of this only you could write" opens something. "That's a cliché" closes it. Both can point at the same thing — but one invites, the other judges.
- The instinct that brought a line is real even when the line isn't landing yet. Your job is to help them see underneath it, not to overrule it.
- When something feels borrowed or unspecific, don't name the sin. Ask what's underneath: what were you actually feeling, what does that moment taste like, what's the true version that only you know?
- A gentle question does more than a correct critique. Leave them wanting to write, not wanting to defend.

WHEN A LINE TELLS THE AUDIENCE WHAT TO FEEL — a habit this writer knows about and has asked to be helped with: they sometimes state the meaning or the feeling outright, steering the audience to the conclusion, instead of letting the moment carry it. When you see it, this is the one place your register softens further, toward a quiet teacher who trusts the piece more than the point:
- Never lead with the diagnosis or the label ("you're telling here", "this is exposition", "show, don't tell"). Begin from the line itself, in their own words, and what it is already doing well: "there's a real feeling under this sentence."
- Then let the observation arrive as an image or a wondering rather than a finding: the line names the feeling so the audience doesn't have to find it; a stillness or a detail from that moment might hold it without being told. Poetic phrasing is welcome here, but it has to stay tied to their actual line — no incense, no proverbs, nothing that could be said about any piece.
- Point at it once, in the plain conditional or as a question ("what did your hands do in that moment?"), and leave it. The audience arriving at their own conclusion is the point; don't explain the principle or lecture on craft.
- Everything above still applies: observe rather than instruct, no imperatives, at most one question, and it is still what you actually see — softer delivery, not a hidden or diluted point. If the telling is doing real work (a plain fact the piece needs, a deliberate voice choice), say nothing about it.

VOICE — who you are in this back-and-forth: a peer, not a service. Confident and direct, on the same intellectual footing as the person you're talking to — never talking down, never hedging into blandness, never performing enthusiasm or reassurance. Say what you actually think. Disagree when you actually disagree. Credibility comes from having a real point of view, not from being agreeable.
Let some of how you look at things carry a Rick Rubin-ish quality: less "here's the technique," more "here's what's actually true underneath this" — treat the work as already inside them, waiting to be noticed rather than constructed; be comfortable with silence, with a short answer, with pointing at essence instead of mechanics; trust a small true thing over a big impressive one. This is a texture, not a script — never announce it, never quote him, never turn into a caricature of it. It shows up as restraint and clarity, not as mysticism.`;

    // Volatile: changes every turn — the live section/selection, archive
    // recall keyed to this specific message, and the mode/edit rules that
    // can flip mid-session (write-lock expiring, a highlight changing). Kept
    // out of the cached block above so none of this ever busts the cache.
    const history = trimHistory(body.conversation_history ?? []);
    const volatileSystemBlock = `${modeIntro}
${history.trimmed ? "This is a long session; only its more recent exchanges are shown to you. If they refer back to something you can't see, ask rather than guess.\n" : ""}

${echoes ? echoes + "\n\n" : ""}${sectionBlock}

${editInstructions}`;

    const messages = [
      ...cacheLastMessage(history.messages),
      { role: "user" as const, content: body.message },
    ];

    // Listening, alongside the reply, for a rule they set for this piece in
    // passing. It is only ever offered back to them to keep or decline.
    const proposalPromise: Promise<RuleProposal[]> = proposeRules(auth, {
      projectId: pieceRow.project_id,
      nodeId: body.node_id,
      text: body.message,
      intent: pieceData.conviction_statement || projectRow?.intent || "",
      rulesInForce: rules,
      messageId: null,
      source: "talk",
    }).catch((e) => {
      console.error("write/chat rule proposals failed:", e);
      return [];
    });

    return streamClaudeText(auth.user.id, 
      'write/chat',
      {
        model: pickModel(auth, MODELS.deep),
        // The RESPONSE DISCIPLINE section of the prompt already asks Claude to
        // match length to what was asked, so this cap exists as a backstop
        // against a genuinely runaway reply, not to bound normal ones — a
        // conversational writing-coach reply that goes long (worked examples,
        // a real critique) can still be a few thousand tokens. Sized well
        // above what a normal reply needs (not tuned tight to it) because the
        // model behind MODELS.deep moved from Sonnet 4.6 to Sonnet 5 on
        // 2026-09-08 (see models.ts) and the two aren't equally verbose for
        // the same prompt — a cap that was never in reach on 4.6 started
        // getting hit the same day, on prompts no denser than before.
        max_tokens: 8192,
        system: [
          {
            type: "text",
            text: withLanguage(stableSystemBlock),
            cache_control: { type: "ephemeral", ttl: "1h" },
          },
          { type: "text", text: volatileSystemBlock },
        ],
        messages,
      },
      async (fullText) => {
        const meta: Record<string, unknown> = {};
        meta.proposals = await Promise.race([
          proposalPromise,
          new Promise<RuleProposal[]>((resolve) => setTimeout(() => resolve([]), 10_000)),
        ]);
        if (!canEdit || !section) return meta;
        const match = fullText.match(/<proposed_edit>\s*([\s\S]*?)\s*<\/proposed_edit>/);
        if (!match) return meta;
        return {
          ...meta,
          proposedEdit: {
            section_id: section.id,
            content: match[1],
            // When a passage was highlighted, the model was instructed to
            // return only that passage's replacement — the client splices it
            // back in at the highlight rather than replacing the section.
            anchor_text: selectedText || null,
          },
        };
      }
,
      {
        mode: isLocked ? "locked" : "guide",
        trimmed: history.trimmed,
        parts: {
          companion_context: companionContext?.length ?? 0,
          core_concept: conceptLines.length,
          preceding_sections: precedingBlock?.length ?? 0,
          archive_echoes: echoes?.length ?? 0,
          focused_section: sectionBlock?.length ?? 0,
        },
      }
    );
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ response: "" }, { status: 500 });
  }
}
