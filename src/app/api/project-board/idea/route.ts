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
      .select("id, title, one_sentence, arc, thematic_territory, status")
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
      .select("id")
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
