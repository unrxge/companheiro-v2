import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface SessionLogRequest {
  piece_id: string;
  what_was_done: string;
  next_step: string;
  duration_minutes?: number;
  completed_task_ids?: string[];
}

interface SessionLogResponse {
  success: boolean;
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<SessionLogResponse>> {
  try {
    const body: SessionLogRequest = await request.json();

    if (!body.piece_id || !body.what_was_done || !body.next_step) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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

    // Insert session log
    const { error: logError } = await supabase.from("session_logs").insert([
      {
        user_id: userId,
        piece_id: body.piece_id,
        what_was_done: body.what_was_done,
        next_step: body.next_step,
        duration_minutes: body.duration_minutes || null,
      },
    ]);

    if (logError) {
      console.error("Error inserting session log:", logError);
      return NextResponse.json(
        { success: false, error: "Failed to log session" },
        { status: 500 }
      );
    }

    // Mark completed tasks as complete
    if (body.completed_task_ids && body.completed_task_ids.length > 0) {
      for (const taskId of body.completed_task_ids) {
        await supabase
          .from("tasks")
          .update({ status: "complete" })
          .eq("id", taskId)
          .eq("user_id", userId);
      }
    }

    // Get next pending task
    const { data: tasksData } = await supabase
      .from("tasks")
      .select("title")
      .eq("piece_id", body.piece_id)
      .eq("status", "pending")
      .order("order", { ascending: true })
      .limit(1);

    // Update piece's next_action
    if (tasksData && tasksData.length > 0) {
      await supabase
        .from("pieces")
        .update({ next_action: tasksData[0].title })
        .eq("id", body.piece_id)
        .eq("user_id", userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Session log error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
