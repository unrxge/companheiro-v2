import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface PiecesResponse {
  active: Array<{
    id: string;
    title: string;
    arc: string;
    thematic_territory: string;
    stage: string;
    next_action: string;
    tasks: Array<{ id: string; title: string; type: string }>;
  }>;
  queue: Array<{
    id: string;
    title: string;
    arc: string;
    one_sentence: string;
    status: "ready" | "developing";
  }>;
  archived: Array<{
    id: string;
    title: string;
    arc: string;
    created_at: string;
  }>;
}

export async function GET(_request: NextRequest): Promise<NextResponse<PiecesResponse>> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch (error) {
              console.error("Error setting cookies:", error);
            }
          },
        },
      }
    );

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { active: [], queue: [], archived: [] },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Fetch active pieces, queue ideas, and archived pieces concurrently —
    // these three queries are independent of each other.
    const [{ data: activePieces }, { data: queueIdeas }, { data: archivedPieces }] = await Promise.all([
      supabase
        .from("pieces")
        .select("id, title, arc, thematic_territory, stage, next_action")
        .eq("user_id", userId)
        .neq("stage", "posted")
        .neq("stage", "queued")
        .order("created_at", { ascending: false }),
      supabase
        .from("ideas")
        .select("id, title, arc, one_sentence, status")
        .eq("user_id", userId)
        .in("status", ["ready", "developing"])
        .order("created_at", { ascending: false }),
      supabase
        .from("pieces")
        .select("id, title, arc, created_at")
        .eq("user_id", userId)
        .eq("stage", "posted")
        .order("created_at", { ascending: false }),
    ]);

    // Get tasks for each active piece (also concurrent)
    const activePiecesWithTasks = await Promise.all(
      (activePieces || []).map(async (piece) => {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, title, type")
          .eq("piece_id", piece.id)
          .eq("status", "pending")
          .order("order", { ascending: true });

        return {
          ...piece,
          tasks: (tasks || []).map((t) => ({ id: t.id, title: t.title, type: t.type })),
        };
      })
    );

    return NextResponse.json({
      active: activePiecesWithTasks,
      queue: queueIdeas || [],
      archived: archivedPieces || [],
    });
  } catch (error) {
    console.error("Pieces route error:", error);
    return NextResponse.json(
      { active: [], queue: [], archived: [] },
      { status: 500 }
    );
  }
}
