import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ActivateRequest {
  idea_id: string;
}

interface ActivateResponse {
  success: boolean;
  piece_id?: string;
  error?: string;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ActivateResponse>> {
  try {
    const body: ActivateRequest = await request.json();

    if (!body.idea_id) {
      return NextResponse.json(
        { success: false, error: "Missing idea_id" },
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

    // Update idea status to "active"
    const { error: updateError } = await supabase
      .from("ideas")
      .update({ status: "active" })
      .eq("id", body.idea_id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating idea:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to activate idea" },
        { status: 500 }
      );
    }

    // Check if piece exists for this idea
    const { data: existingPiece } = await supabase
      .from("pieces")
      .select("id")
      .eq("idea_id", body.idea_id)
      .limit(1)
      .single();

    let pieceId: string;

    if (existingPiece) {
      pieceId = existingPiece.id;
      // Update piece stage if needed
      await supabase
        .from("pieces")
        .update({ stage: "writing" })
        .eq("id", pieceId);
    } else {
      // Get idea details and create piece
      const { data: idea } = await supabase
        .from("ideas")
        .select("id, title, arc, thematic_territory")
        .eq("id", body.idea_id)
        .single();

      if (!idea) {
        return NextResponse.json(
          { success: false, error: "Idea not found" },
          { status: 404 }
        );
      }

      const { data: newPiece, error: createError } = await supabase
        .from("pieces")
        .insert([
          {
            user_id: userId,
            idea_id: body.idea_id,
            title: idea.title,
            arc: idea.arc,
            thematic_territory: idea.thematic_territory,
            format: "substack",
            stage: "writing",
            next_action: "Begin writing",
          },
        ])
        .select()
        .single();

      if (createError || !newPiece) {
        console.error("Error creating piece:", createError);
        return NextResponse.json(
          { success: false, error: "Failed to create piece" },
          { status: 500 }
        );
      }

      pieceId = newPiece.id;
    }

    return NextResponse.json({
      success: true,
      piece_id: pieceId,
    });
  } catch (error) {
    console.error("Activate route error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
