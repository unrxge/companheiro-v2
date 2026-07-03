import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface DeactivateRequest {
  piece_id: string;
}

interface DeactivateResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<DeactivateResponse>> {
  try {
    const body: DeactivateRequest = await request.json();

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

    const { data: piece, error: pieceError } = await supabase
      .from("pieces")
      .select("id, idea_id")
      .eq("id", body.piece_id)
      .eq("user_id", userId)
      .single();

    if (pieceError || !piece) {
      return NextResponse.json(
        { success: false, error: "Piece not found" },
        { status: 404 }
      );
    }

    const { error: updatePieceError } = await supabase
      .from("pieces")
      .update({ stage: "queued" })
      .eq("id", piece.id)
      .eq("user_id", userId);

    if (updatePieceError) {
      console.error("Error queuing piece:", updatePieceError);
      return NextResponse.json(
        { success: false, error: "Failed to move piece back to queue" },
        { status: 500 }
      );
    }

    if (piece.idea_id) {
      await supabase
        .from("ideas")
        .update({ status: "ready" })
        .eq("id", piece.idea_id)
        .eq("user_id", userId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Deactivate route error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
