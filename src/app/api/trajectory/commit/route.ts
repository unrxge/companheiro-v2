import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { distillPortrait } from "@/lib/portrait";

const VALID_TONES = ["grounded", "restless", "tender", "expansive", "urgent"];

interface CommitMessage {
  role: "user" | "assistant";
  content: string;
}

interface CommitRequest {
  statement: string;
  born_project?: string;
  tone?: string;
  conversation?: CommitMessage[];
}

interface CommitResponse {
  success: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse<CommitResponse>> {
  try {
    const body: CommitRequest = await request.json();

    if (!body.statement?.trim()) {
      return NextResponse.json({ success: false }, { status: 400 });
    }

    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const tone = body.tone && VALID_TONES.includes(body.tone) ? body.tone : null;

    const { error: rpcError } = await supabase.rpc("commit_trajectory", {
      p_statement: body.statement.trim(),
      p_born_project: body.born_project?.trim() || null,
      p_tone: tone,
    });

    if (rpcError) {
      console.error("commit_trajectory RPC error:", rpcError);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    // Distill what this zoom-out conversation revealed — how they reacted to
    // the reading, what shifted their thinking, what tension kept surfacing.
    // Never blocks on failure.
    if (body.conversation && body.conversation.length > 0) {
      const conversationText = body.conversation
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
      await distillPortrait(
        { supabase, user: userData.user },
        "zoom_out",
        `${conversationText}\n\nAgreed trajectory: ${body.statement.trim()}`
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trajectory commit route error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
