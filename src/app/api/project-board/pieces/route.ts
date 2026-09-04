import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface PiecesResponse {
  active: Array<{
    id: string;
    title: string;
    arc: string;
    thematic_territory: string;
    stage: string;
    next_action: string;
    created_at: string;
    tasks: Array<{ id: string; title: string; type: string }>;
  }>;
  queue: Array<{
    id: string;
    title: string;
    arc: string;
    thematic_territory: string;
    one_sentence: string;
    status: "ready" | "developing";
  }>;
  archived: Array<{
    id: string;
    title: string;
    arc: string;
    thematic_territory: string;
    created_at: string;
  }>;
  // In-progress conceptualise sessions that haven't reached core concept yet.
  // Included in queue count displays across the app.
  draftCount: number;
}

export async function GET(_request: NextRequest): Promise<NextResponse<PiecesResponse>> {
  try {
    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { active: [], queue: [], archived: [], draftCount: 0 },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    const [{ data: activePieces }, { data: allQueueIdeas }, { data: archivedPieces }, { count: draftCount }] = await Promise.all([
      supabase
        .from("pieces")
        .select("id, title, arc, thematic_territory, stage, next_action, idea_id, created_at")
        .eq("user_id", userId)
        .neq("stage", "posted")
        .neq("stage", "queued")
        .order("created_at", { ascending: false }),
      supabase
        .from("ideas")
        .select("id, title, arc, thematic_territory, one_sentence, status")
        .eq("user_id", userId)
        .in("status", ["ready", "developing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("pieces")
        .select("id, title, arc, thematic_territory, created_at")
        .eq("user_id", userId)
        .eq("stage", "posted")
        .order("created_at", { ascending: false }),
      supabase
        .from("conceptualise_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);

    // Ideas that already have a linked piece belong in Active, not Queue.
    const linkedIdeaIds = new Set((activePieces || []).map((p) => p.idea_id).filter(Boolean));
    const queueIdeas = (allQueueIdeas || []).filter((idea) => !linkedIdeaIds.has(idea.id));

    const activePiecesWithTasks = await Promise.all(
      (activePieces || []).map(async (piece) => {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, type")
          .eq("piece_id", piece.id)
          .eq("status", "pending")
          .order("order", { ascending: true });

        const { id, title, arc, thematic_territory, stage, next_action, created_at } = piece;
        return {
          id, title, arc, thematic_territory, stage, next_action, created_at,
          tasks: (tasks || []).map((t) => ({ id: t.id, title: t.title, type: t.type })),
        };
      })
    );

    return NextResponse.json({
      active: activePiecesWithTasks,
      queue: queueIdeas,
      archived: archivedPieces || [],
      draftCount: draftCount ?? 0,
    });
  } catch (error) {
    console.error("Pieces route error:", error);
    return NextResponse.json(
      { active: [], queue: [], archived: [], draftCount: 0 },
      { status: 500 }
    );
  }
}
