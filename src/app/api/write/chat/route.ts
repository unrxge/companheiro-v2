import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { MODELS } from "@/lib/models";
import { recallEchoes } from "@/lib/recall";
import { streamClaudeText } from "@/lib/streaming";

interface ActiveSection {
  id: string;
  label: string | null;
  intended_emotion: string | null;
  content: string;
  is_locked: boolean;
}

interface ChatRequest {
  message: string;
  piece_id: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  active_section?: ActiveSection | null;
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

    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .select(
        "title, conviction_statement, emotional_journey, core_truth, substack_goals, open_threads, substack_draft, writing_ethos"
      )
      .eq("id", body.piece_id)
      .eq("user_id", user.id)
      .single();

    if (pieceError || !pieceData) {
      return NextResponse.json({ response: "" }, { status: 404 });
    }

    const [companionContext, echoes] = await Promise.all([
      buildCompanionContext(auth),
      recallEchoes(auth, `${pieceData.title || ""} ${body.message}`),
    ]);

    const section = body.active_section;
    const canEdit = !!section && !section.is_locked;

    const sectionBlock = section
      ? `THE SECTION THEY'RE FOCUSED ON RIGHT NOW:
Label: ${section.label || "(untitled)"}${section.intended_emotion ? `\nIntended feeling: ${section.intended_emotion}` : ""}
Locked: ${section.is_locked ? "yes — you may discuss it but must NOT propose changes to it" : "no"}
Current text:
"""
${section.content || "(empty)"}
"""`
      : "They aren't focused on a specific section right now — keep it general.";

    const editInstructions = canEdit
      ? `PROPOSING AN EDIT: When — and only when — the person clearly wants you to write or rewrite prose for this section (not when they're just asking what you think), produce the section's full revised text and append it at the very end wrapped exactly like this:
<proposed_edit>
the complete new text for this section
</proposed_edit>
Rules:
- Always the FULL section text, not a fragment — it replaces the section wholesale on approval.
- Preserve their voice; weave in their intent and any anchor lines rather than overwriting what already works.
- Let the length be whatever the moment needs — a tightened sentence or a full redraft.
- Your chat message should briefly say what you changed and why; the person approves or rejects the proposed text before anything lands.
- Never propose an edit speculatively or on the first exchange about a section — earn it through the back-and-forth.`
      : section?.is_locked
        ? "This section is LOCKED. Discuss it if asked, but do not propose any changes to it."
        : "No section is focused, so do not propose edits — talk through the piece.";

    const systemPrompt = `You are Companheiro, sitting beside a writer while they work on a piece. You help them think, unstick sections, sharpen angles, challenge ideas, and give concrete examples. You are a companion, not a ghostwriter — the prose stays theirs.

${COMPANION_TONE}

${companionContext ? companionContext + "\n\n" : ""}${echoes ? echoes + "\n\n" : ""}THE PIECE:
Title: ${pieceData.title || "(untitled)"}
${pieceData.writing_ethos ? `Their ethos for it: ${pieceData.writing_ethos}\n` : ""}Conviction: ${pieceData.conviction_statement || "(not provided)"}
Emotional Journey: ${pieceData.emotional_journey || "(not provided)"}
Core Truth: ${pieceData.core_truth || "(not provided)"}
Goals: ${pieceData.substack_goals || "(not provided)"}

${sectionBlock}

${editInstructions}

Keep responses concise and focused on moving the piece forward.`;

    const messages = [
      ...body.conversation_history,
      { role: "user" as const, content: body.message },
    ];

    return streamClaudeText(
      {
        model: MODELS.deep,
        max_tokens: 1200,
        system: systemPrompt,
        messages,
      },
      (fullText) => {
        if (!canEdit || !section) return {};
        const match = fullText.match(/<proposed_edit>\s*([\s\S]*?)\s*<\/proposed_edit>/);
        if (!match) return {};
        return { proposedEdit: { section_id: section.id, content: match[1] } };
      }
    );
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ response: "" }, { status: 500 });
  }
}
