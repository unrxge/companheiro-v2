import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { buildCompanionContext } from "@/lib/companion-context";
import { COMPANION_TONE } from "@/lib/companion-tone";
import { MODELS } from "@/lib/models";
import { recallEchoes } from "@/lib/recall";
import { streamClaudeText } from "@/lib/streaming";

interface ChatRequest {
  message: string;
  piece_id: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
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
        "title, conviction_statement, emotional_journey, core_truth, substack_goals, open_threads, substack_draft"
      )
      .eq("id", body.piece_id)
      .eq("user_id", user.id)
      .single();

    if (pieceError || !pieceData) {
      return NextResponse.json({ response: "" }, { status: 404 });
    }

    // Context + archive echoes fetched concurrently — the writing companion
    // should know the person and their history, not just this one piece.
    const [companionContext, echoes] = await Promise.all([
      buildCompanionContext(auth),
      recallEchoes(auth, `${pieceData.title || ""} ${body.message}`),
    ]);

    const systemPrompt = `You are Companheiro, sitting beside a writer while they work on a piece. You are their writing companion — you help them think, unstick sections, sharpen angles, and challenge ideas to deepen them. You never rewrite unless explicitly asked.

${COMPANION_TONE}

${companionContext ? companionContext + "\n\n" : ""}${echoes ? echoes + "\n\n" : ""}THE PIECE THEY'RE WRITING:
Title: ${pieceData.title || "(untitled)"}
Conviction Statement: ${pieceData.conviction_statement || "(not provided)"}
Emotional Journey: ${pieceData.emotional_journey || "(not provided)"}
Core Truth: ${pieceData.core_truth || "(not provided)"}
Goals: ${pieceData.substack_goals || "(not provided)"}
Open Threads: ${(pieceData.open_threads || []).join("; ") || "(none)"}

Current Draft:
${pieceData.substack_draft || "(writer hasn't started yet)"}

Keep responses concise and focused on moving the piece forward.`;

    const messages = [
      ...body.conversation_history,
      { role: "user" as const, content: body.message },
    ];

    return streamClaudeText({
      model: MODELS.deep,
      max_tokens: 700,
      system: systemPrompt,
      messages,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json({ response: "" }, { status: 500 });
  }
}
