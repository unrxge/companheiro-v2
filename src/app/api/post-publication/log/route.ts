import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface LogRequest {
  piece_id: string;
  thread: string;
  what_it_opened: string;
  unresolved: string;
  natural_continuations: string;
}

interface LogResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<LogResponse>> {
  try {
    const body: LogRequest = await request.json();

    if (!body.piece_id) {
      return NextResponse.json(
        { success: false, error: "Missing piece_id" },
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
    const now = new Date().toISOString();

    // Split natural_continuations into array
    const continuationsArray = body.natural_continuations
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    // Insert into post_publication_logs
    const { error: logError } = await supabase
      .from("post_publication_logs")
      .insert([
        {
          user_id: userId,
          piece_id: body.piece_id,
          thread: body.thread,
          what_it_opened: body.what_it_opened,
          unresolved: body.unresolved,
          natural_continuations: continuationsArray,
        },
      ]);

    if (logError) {
      console.error("Error inserting post-publication log:", logError);
      return NextResponse.json(
        { success: false, error: "Failed to log post-publication" },
        { status: 500 }
      );
    }

    // Update piece stage to "posted" and set posted_at
    const { error: pieceError } = await supabase
      .from("pieces")
      .update({
        stage: "posted",
        posted_at: now,
      })
      .eq("id", body.piece_id)
      .eq("user_id", userId);

    if (pieceError) {
      console.error("Error updating piece:", pieceError);
      return NextResponse.json(
        { success: false, error: "Failed to update piece" },
        { status: 500 }
      );
    }

    // Get the idea_id from the piece to update the idea status
    const { data: pieceData } = await supabase
      .from("pieces")
      .select("idea_id")
      .eq("id", body.piece_id)
      .eq("user_id", userId)
      .single();

    if (pieceData?.idea_id) {
      // Update linked idea status to "complete"
      const { error: ideaError } = await supabase
        .from("ideas")
        .update({ status: "complete" })
        .eq("id", pieceData.idea_id)
        .eq("user_id", userId);

      if (ideaError) {
        console.error("Error updating idea:", ideaError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Post-publication log error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
