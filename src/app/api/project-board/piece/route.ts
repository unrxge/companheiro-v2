import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface Task {
  id: string;
  title: string;
  type: "creation" | "execution";
  status: "pending" | "complete";
}

interface SessionLog {
  id: string;
  what_was_done: string;
  next_step: string;
  created_at: string;
  duration_minutes: number | null;
}

interface PieceDetail {
  id: string;
  title: string;
  arc: string;
  thematic_territory: string;
  one_sentence: string;
  conviction_statement: string;
  emotional_journey: string;
  core_truth: string;
  substack_goals: string;
  short_form_goals: string;
  open_threads: string[];
  conceptualisation_log: ConversationMessage[];
  tasks: Task[];
  session_logs: SessionLog[];
}

interface PieceDetailResponse {
  success: boolean;
  piece?: PieceDetail;
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<PieceDetailResponse>> {
  try {
    const pieceId = request.nextUrl.searchParams.get("id");

    if (!pieceId) {
      return NextResponse.json(
        { success: false, error: "Missing piece ID" },
        { status: 400 }
      );
    }

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
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    console.log('Fetching piece:', pieceId, 'for user:', userId);

    // Fetch piece details
    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .select(
        "id, title, arc, thematic_territory, conviction_statement, emotional_journey, core_truth, substack_goals, short_form_goals, open_threads, idea_id, substack_draft"
      )
      .eq("id", pieceId)
      .eq("user_id", userId)
      .single();

    console.log('Piece query result:', { pieceError, hasPieceData: !!pieceData });

    if (pieceError || !pieceData) {
      console.error('Piece not found:', pieceError);
      return NextResponse.json(
        { success: false, error: "Piece not found", debug: pieceError?.message },
        { status: 404 }
      );
    }

    // Fetch linked idea to get one_sentence and conceptualisation_log
    let ideaData: { one_sentence?: string; conceptualisation_log?: ConversationMessage[] } = {};
    if (pieceData.idea_id) {
      const { data: idea, error: ideaError } = await supabase
        .from("ideas")
        .select("one_sentence, conceptualisation_log")
        .eq("id", pieceData.idea_id)
        .eq("user_id", userId)
        .single();

      if (ideaError) {
        console.error('Idea query error:', ideaError);
      } else if (idea) {
        ideaData = idea;
      }
    }

    // Fetch all tasks (pending and completed) - filter by user_id for RLS safety
    const { data: tasksData, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, type, status")
      .eq("piece_id", pieceId)
      .eq("user_id", userId)
      .order("order", { ascending: true });

    if (tasksError) {
      console.error('Tasks query error:', tasksError);
    }

    // Fetch session logs - filter by user_id for RLS safety
    const { data: logsData, error: logsError } = await supabase
      .from("session_logs")
      .select("id, what_was_done, next_step, created_at, duration_minutes")
      .eq("piece_id", pieceId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (logsError) {
      console.error('Session logs query error:', logsError);
    }

    console.log('Successfully fetched piece with', tasksData?.length || 0, 'tasks and', logsData?.length || 0, 'logs');

    return NextResponse.json({
      success: true,
      piece: {
        ...pieceData,
        one_sentence: ideaData.one_sentence || '',
        conceptualisation_log: ideaData.conceptualisation_log || [],
        open_threads: pieceData.open_threads || [],
        tasks: (tasksData || []) as Task[],
        session_logs: (logsData || []) as SessionLog[],
      },
    });
  } catch (error) {
    console.error("Piece detail error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
