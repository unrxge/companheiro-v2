import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface DraftRequest {
  node_id: string;
  title?: string;
  substack_draft?: string;
  short_form_script?: string;
  writing_ethos?: string;
}

interface DraftResponse {
  success: boolean;
  error?: string;
}

// PATCH — small, frequent edits to a piece's root node from within Write
// mode: the title (renaming from the Write page), the flattened draft cache,
// the generated short-form script, and the writing ethos. No `stage`
// transition here (unlike the old pieces-backed route) — the node/thread
// model has no write-journey-stage field, and nothing downstream reads one
// for a studio_nodes row, so there's nothing to keep in sync.
export async function PATCH(request: NextRequest): Promise<NextResponse<DraftResponse>> {
  try {
    const body: DraftRequest = await request.json();

    if (!body.node_id) {
      return NextResponse.json(
        { success: false, error: "Missing node_id" },
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
    if (body.title !== undefined) {
      updateData.title = body.title;
    }
    if (body.substack_draft !== undefined) {
      updateData.body = body.substack_draft;
    }
    if (body.short_form_script !== undefined) {
      updateData.short_form_script = body.short_form_script;
    }
    if (body.writing_ethos !== undefined) {
      updateData.writing_ethos = body.writing_ethos;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true });
    }

    const { error: updateError } = await supabase
      .from("studio_nodes")
      .update(updateData)
      .eq("id", body.node_id)
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
