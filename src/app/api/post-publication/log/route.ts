import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface LogRequest {
  piece_id?: string;
  node_id?: string;
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

    if (!body.piece_id && !body.node_id) {
      return NextResponse.json(
        { success: false, error: "Missing piece_id or node_id" },
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
    const now = new Date().toISOString();

    // Split natural_continuations into array
    const continuationsArray = body.natural_continuations
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);

    // Node/thread-model path (Phase 4 of the Project Board -> Studio
    // migration): studio_post_publication_logs instead of
    // post_publication_logs, and the studio equivalents of "piece posted" —
    // studio_nodes.status = 'done' and studio_projects.shelf_stage =
    // 'completed' + completed_at — instead of pieces.stage/posted_at and
    // ideas.status. No idea-status equivalent exists on the node/thread
    // model, so that third update is simply not needed here.
    if (body.node_id) {
      const { error: logError } = await supabase
        .from("studio_post_publication_logs")
        .insert([
          {
            user_id: userId,
            node_id: body.node_id,
            thread: body.thread,
            what_it_opened: body.what_it_opened,
            unresolved: body.unresolved,
            natural_continuations: continuationsArray,
          },
        ]);

      if (logError) {
        console.error("Error inserting studio post-publication log:", logError);
        return NextResponse.json(
          { success: false, error: "Failed to log post-publication" },
          { status: 500 }
        );
      }

      const { data: nodeData, error: nodeFetchError } = await supabase
        .from("studio_nodes")
        .select("project_id")
        .eq("id", body.node_id)
        .eq("user_id", userId)
        .single();

      if (nodeFetchError || !nodeData) {
        console.error("Error fetching node:", nodeFetchError);
        return NextResponse.json(
          { success: false, error: "Failed to update node" },
          { status: 500 }
        );
      }

      const { error: nodeError } = await supabase
        .from("studio_nodes")
        .update({ status: "done" })
        .eq("id", body.node_id)
        .eq("user_id", userId);

      if (nodeError) {
        console.error("Error updating node:", nodeError);
        return NextResponse.json(
          { success: false, error: "Failed to update node" },
          { status: 500 }
        );
      }

      const { error: projectError } = await supabase
        .from("studio_projects")
        .update({ shelf_stage: "completed", completed_at: now })
        .eq("id", nodeData.project_id)
        .eq("user_id", userId);

      if (projectError) {
        console.error("Error updating project:", projectError);
        return NextResponse.json(
          { success: false, error: "Failed to update project" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }

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
