import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { PROSE_STANDARD, STORY_STRUCTURE } from "@/lib/writing-craft";
import { MODELS } from "@/lib/models";
import { recallEchoes } from "@/lib/recall";
import { streamClaudeText } from "@/lib/streaming";
import { withLanguage } from "@/lib/language";

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
  piece_id: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  active_section?: ActiveSection | null;
  preceding_sections?: PrecedingSection[];
  selected_text?: string | null;
  assistant_mode?: "write" | "coach";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ response: "" }, { status: 401 });
    }

    const body: ChatRequest = await request.json();

    if (!body.message || !body.piece_id) {
      return NextResponse.json({ response: "" }, { status: 400 });
    }

    const { supabase, user } = auth;

    const [{ data: pieceData, error: pieceError }, { data: settingsData }] = await Promise.all([
      supabase
        .from("pieces")
        .select(
          "title, conviction_statement, emotional_journey, core_truth, substack_goals, open_threads, substack_draft, writing_ethos"
        )
        .eq("id", body.piece_id)
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("user_settings")
        .select("assistant_write_locked_until")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (pieceError || !pieceData) {
      return NextResponse.json({ response: "" }, { status: 404 });
    }

    const [companionContext, echoes] = await Promise.all([
      buildCompanionContext(auth),
      recallEchoes(auth, `${pieceData.title || ""} ${body.message}`),
    ]);

    const section = body.active_section;
    // The write-lock is re-checked here, not trusted from the client — the
    // whole point of the lock is that switching back to write mode early
    // isn't possible, including by calling this endpoint directly.
    const lockedUntil = settingsData?.assistant_write_locked_until ?? null;
    const isLocked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
    const assistantMode = isLocked ? "coach" : body.assistant_mode || "write";
    const selectedText = body.selected_text || null;
    const canEdit = !!section && !section.is_locked && assistantMode === "write";

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

    const editInstructions =
      assistantMode === "coach"
        ? `SUGGEST MODE — HARD RULE, NO EXCEPTIONS: you never write for them here, full stop. This is not a preference to weigh against how stuck they seem — it holds exactly as much when they're breezing through as when they're visibly struggling to land a line. No <proposed_edit>, ever, in this mode.
What you CAN do: a brief, cautious illustrative example — a fragment, half a sentence, just enough to point at a technique or a direction — never a usable drop-in line, never something that reads as "here, take this." If you catch yourself writing something they could paste in whole, cut it down until it can't be. The example exists to convey a point, not to solve their sentence for them.
The more they express difficulty ("I don't know how to say this," "I can't find the words"), the more this matters, not less — that's the exact moment it would be easiest to just hand them a line, and the exact moment it would do them the least good. Instead: take a different angle each time. Ask what they actually mean underneath the words they're reaching for. Ask what it would sound like if they said it to one specific person instead of an audience. Name the shape of the sentence without filling it in. Point at a comparison from somewhere else entirely. Vary the approach — don't reach for the same move twice in a session.
${selectedText ? `They've highlighted a specific passage — start there.` : ""}
One question maximum per response, and only when it genuinely opens something up. Sometimes a well-placed observation lands better than a question. Never stack questions; if you have several, pick the one that matters most now and let the conversation find the others. The prose stays entirely theirs.`
      : canEdit
        ? `WRITE MODE — you're allowed to write for them here, but don't rush to it.
Before you ever get to "want to try it yourself, or should I write it" — when you've understood what they're reaching for, weave in a brief, concrete example of their own explanation put into practice, seamlessly, as part of the natural back-and-forth (not as a separate announced step). Show, in a compact way, what their idea could sound like — this is about keeping their own creative reflexes alive even in write mode, not about jumping straight to a full solve.
Only once that's happened, and only when it's genuinely the moment for it, offer the choice: try it themselves first, or have you show a version. This offer must be phrased freshly every time — read the actual conversation and phrase it in a way specific to what's actually being discussed right now. Never reuse the same template question twice in a session ("want to try landing that yourself first, or shall I show you a version?" is exactly the kind of line that must never repeat) — if you notice yourself about to say something close to a phrasing you've already used, find a different way in.
When — and only when — they clearly want you to write or rewrite prose (not when they're just asking what you think), produce the revision and append it at the very end wrapped exactly like this:
<proposed_edit>
the revised text
</proposed_edit>
Rules:
${
  selectedText
    ? `- They highlighted a specific sentence or passage — that is the ENTIRE scope of this edit. Return ONLY the rewritten version of that highlighted passage, not the surrounding text and not the rest of the section. It gets spliced back into exactly where the highlight was; anything outside it must stay untouched, so don't include it.`
    : `- No specific passage was highlighted, so this is a full-section edit — return the section's complete revised text, not a fragment. It replaces the section wholesale on approval.`
}
- Preserve the ethos of their voice; weave in their intent and adapt their wording to fit into the standard of phenomenal storytelling. If anchor lines are allocated to this section, work them in naturally — they're precious to the writer and must not be dropped or ignored.
- Consistency is non-negotiable: the tone, style, and storyline must read as a continuation of THE PIECE SO FAR, not a fresh take on the topic in isolation. If your proposed text would contradict or ignore something already established above, don't propose it — raise the tension in chat instead.
- When the ask is a localized tweak, don't just splice the new fragment into untouched surroundings without checking it still reads clean — a transition that no longer connects, a reference to phrasing you just changed, a beat that now repeats or contradicts. But do not rewrite anything beyond what was actually asked for, especially when a specific passage was highlighted.
- Let the length be whatever the moment needs — a tightened sentence or a full redraft.
- Your chat message should briefly say what you changed and why; the person approves or rejects the proposed text before anything lands.
- Never propose an edit speculatively or on the first exchange about a section — earn it through the back-and-forth.`
        : section?.is_locked
          ? "This section is LOCKED. Discuss it if asked, but do not propose any changes to it."
          : "No section is focused, so do not propose edits — talk through the piece.";

    const systemPrompt = `You are Companheiro, sitting beside a writer while they work on a piece. ${assistantMode === "coach" ? "In this session they have chosen coach mode — your role is to help them find their own words through questions and reflection, never by writing prose for them." : "You help them think, unstick sections, sharpen angles, challenge ideas, and give concrete examples. You are a companion, not a ghostwriter — the prose stays theirs."}

${COMPANION_TONE}

${PROSE_STANDARD}

${STORY_STRUCTURE}

${companionContext ? companionContext + "\n\n" : ""}${echoes ? echoes + "\n\n" : ""}THE PIECE:
Title: ${pieceData.title || "(untitled)"}
${pieceData.writing_ethos ? `Their ethos for it: ${pieceData.writing_ethos}\n` : ""}Conviction: ${pieceData.conviction_statement || "(not provided)"}
Emotional Journey: ${pieceData.emotional_journey || "(not provided)"}
Core Truth: ${pieceData.core_truth || "(not provided)"}
Goals: ${pieceData.substack_goals || "(not provided)"}

${precedingBlock}

${sectionBlock}

${editInstructions}

RESPONSE DISCIPLINE:
- Match response length and complexity to what was actually asked. A question about one line gets a focused reply about that line — not an essay. A small thing deserves a small answer.
- One question maximum per response, and only when it genuinely opens something. Not every response needs a question. Sometimes the right move is to name something and leave it there.
- Never stack questions. If three things are worth asking, pick the one that matters most right now and let the conversation surface the others naturally.

DELIVERING CRITIQUE — you are beside the writer, not above them:
- Observations, not verdicts. "I wonder if there's a version of this only you could write" opens something. "That's a cliché" closes it. Both can point at the same thing — but one invites, the other judges.
- The instinct that brought a line is real even when the line isn't landing yet. Your job is to help them see underneath it, not to overrule it.
- When something feels borrowed or unspecific, don't name the sin. Ask what's underneath: what were you actually feeling, what does that moment taste like, what's the true version that only you know?
- A gentle question does more than a correct critique. Leave them wanting to write, not wanting to defend.

VOICE — who you are in this back-and-forth: a peer, not a service. Confident and direct, on the same intellectual footing as the person you're talking to — never talking down, never hedging into blandness, never performing enthusiasm or reassurance. Say what you actually think. Disagree when you actually disagree. Credibility comes from having a real point of view, not from being agreeable.
Let some of how you look at things carry a Rick Rubin-ish quality: less "here's the technique," more "here's what's actually true underneath this" — treat the work as already inside them, waiting to be noticed rather than constructed; be comfortable with silence, with a short answer, with pointing at essence instead of mechanics; trust a small true thing over a big impressive one. This is a texture, not a script — never announce it, never quote him, never turn into a caricature of it. It shows up as restraint and clarity, not as mysticism.`;

    const messages = [
      ...body.conversation_history,
      { role: "user" as const, content: body.message },
    ];

    return streamClaudeText(
      {
        model: MODELS.deep,
        max_tokens: 2400,
        system: withLanguage(systemPrompt),
        messages,
      },
      (fullText) => {
        const meta: Record<string, unknown> = { lockedMode: isLocked ? "coach" : null };
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
    );
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ response: "" }, { status: 500 });
  }
}
