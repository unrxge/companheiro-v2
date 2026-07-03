import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface DraftRequest {
  piece_id: string;
  substack_draft?: string;
  short_form_script?: string;
}

interface DraftResponse {
  success: boolean;
  error?: string;
}

export async function PATCH(request: NextRequest): Promise<NextResponse<DraftResponse>> {
  try {
    const body: DraftRequest = await request.json();

    if (!body.piece_id) {
      return NextResponse.json(
        { success: false, error: "Missing piece_id" },
        { status: 400 }
      );
    }

    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    const updateData: Record<string, string> = {};
    if (body.substack_draft !== undefined) {
      updateData.substack_draft = body.substack_draft;
    }
    if (body.short_form_script !== undefined) {
      updateData.short_form_script = body.short_form_script;
    }

    // Get current piece to check stage
    const { data: pieceData } = await supabase
      .from("pieces")
      .select("stage")
      .eq("id", body.piece_id)
      .eq("user_id", userId)
      .single();

    // Update stage to "writing" if it's "conceptualising"
    if (pieceData?.stage === "conceptualising") {
      updateData.stage = "writing";
    }

    const { error: updateError } = await supabase
      .from("pieces")
      .update(updateData)
      .eq("id", body.piece_id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating draft:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to update draft" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Draft save error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
