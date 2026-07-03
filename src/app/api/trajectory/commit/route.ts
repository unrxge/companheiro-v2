import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

const VALID_TONES = ["grounded", "restless", "tender", "expansive", "urgent"];

interface CommitRequest {
  statement: string;
  born_project?: string;
  tone?: string;
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trajectory commit route error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
