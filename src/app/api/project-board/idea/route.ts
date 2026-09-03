import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface Task {
  id: string;
  title: string;
  type: "creation" | "execution";
  status: "pending" | "complete";
}

interface IdeaDetail {
  id: string;
  title: string;
  one_sentence: string;
  arc: string;
  thematic_territory: string;
  status: "ready" | "developing" | "active";
  piece_id?: string;
  tasks?: Task[];
  conviction_statement?: string;
  emotional_journey?: string;
  core_truth?: string;
  substack_goals?: string;
  short_form_goals?: string;
  open_threads?: string | string[];
  created_at?: string;
}

interface IdeaDetailResponse {
  success: boolean;
  idea?: IdeaDetail;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<IdeaDetailResponse>> {
  try {
    const ideaId = request.nextUrl.searchParams.get("id");

    if (!ideaId) {
      return NextResponse.json(
        { success: false, error: "Missing idea ID" },
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

    // Fetch idea
    const { data: ideaData, error: ideaError } = await supabase
      .from("ideas")
      .select("id, title, one_sentence, arc, thematic_territory, status, created_at")
      .eq("id", ideaId)
      .eq("user_id", userId)
      .single();

    if (ideaError || !ideaData) {
      console.error("Idea not found:", ideaError);
      return NextResponse.json(
        { success: false, error: "Idea not found" },
        { status: 404 }
      );
    }

    // Check if idea has a linked piece
    const { data: pieceData } = await supabase
      .from("pieces")
      .select("id, conviction_statement, emotional_journey, core_truth, substack_goals, short_form_goals, open_threads")
      .eq("idea_id", ideaId)
      .eq("user_id", userId)
      .single();

    let tasks: Task[] = [];
    if (pieceData) {
      const { data: tasksData } = await supabase
        .from("tasks")
        .select("id, title, type, status")
        .eq("piece_id", pieceData.id)
        .order("order", { ascending: true });

      tasks = (tasksData || []) as Task[];
    }

    return NextResponse.json({
      success: true,
      idea: {
        ...ideaData,
        piece_id: pieceData?.id,
        tasks,
        conviction_statement: pieceData?.conviction_statement,
        emotional_journey: pieceData?.emotional_journey,
        core_truth: pieceData?.core_truth,
        substack_goals: pieceData?.substack_goals,
        short_form_goals: pieceData?.short_form_goals,
        open_threads: pieceData?.open_threads,
      },
    });
  } catch (error) {
    console.error("Idea detail error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

interface DeleteRequest {
  idea_id: string;
}

interface DeleteResponse {
  success: boolean;
  error?: string;
}

export async function DELETE(request: NextRequest): Promise<NextResponse<DeleteResponse>> {
  try {
    const body: DeleteRequest = await request.json();

    if (!body.idea_id) {
      return NextResponse.json(
        { success: false, error: "Missing idea_id" },
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

    const { error: deleteError } = await supabase
      .from("ideas")
      .delete()
      .eq("id", body.idea_id)
      .eq("user_id", userData.user.id);

    if (deleteError) {
      console.error("Error deleting idea:", deleteError);
      return NextResponse.json(
        { success: false, error: "Failed to delete idea" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete idea error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
