import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { MODELS } from "@/lib/models";
import { createRouteClient } from "@/lib/supabase/route";
import { withLanguage } from "@/lib/language";

interface TranslateRequest {
  piece_id: string;
}

interface TranslateResponse {
  script: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<TranslateResponse>> {
  try {
    const body: TranslateRequest = await request.json();

    if (!body.piece_id) {
      return NextResponse.json(
        { script: "" },
        { status: 400 }
      );
    }

    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { script: "" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Fetch piece
    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .select("substack_draft, short_form_goals, conviction_statement, core_truth")
      .eq("id", body.piece_id)
      .eq("user_id", userId)
      .single();

    if (pieceError || !pieceData || !pieceData.substack_draft) {
      return NextResponse.json(
        { script: "" },
        { status: 404 }
      );
    }

    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 1000,
      system: withLanguage(`You are a translator of long-form written pieces into short-form video scripts. Your job is not to summarize, but to reinterpret — to find the emotional core and the most compelling angle for a 15-60 second video.

Structure the script as:
- Hook (first 3 seconds): grab attention with a question, statement, or emotional beat
- Body (emotional core): the one insight or feeling the piece is really about
- Landing (final image or line): what stays with the viewer

Keep it visual, conversational, and distinct from the written piece. The viewer should feel the same conviction, but through a different lens.`),
      messages: [
        {
          role: "user",
          content: `Here's a Substack piece:

${pieceData.substack_draft}

---

Short form goals/brief: ${pieceData.short_form_goals || "(none provided)"}

Reinterpret this into a short-form video script.`,
        },
      ],
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { script: "" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      script: textContent.text,
    });
  } catch (error) {
    console.error("Translate error:", error);
    return NextResponse.json(
      { script: "" },
      { status: 500 }
    );
  }
}
