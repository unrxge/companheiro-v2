import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { generatePoeticTitle } from "@/lib/generate-poetic-title";

// "Bring an idea" → "Skip to writing": the idea is already clear, so no
// conversation and no core-concept document up front. Creates the project
// and its root piece straight from what the person wrote; the core concept
// can be built later from the board (core-concept page with ?project=).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const { supabase, user } = auth;

    const body = (await request.json()) as { text?: string };
    const text = body.text?.trim();
    if (!text) return NextResponse.json({ success: false, error: "Say what the idea is" }, { status: 400 });

    // Falls back to the text itself on failure, so this never blocks.
    const title = await generatePoeticTitle({
      one_sentence: text.slice(0, 1200),
      conviction_statement: "",
      emotional_journey: "",
      core_truth: "",
    });

    const { data: project, error: projectError } = await supabase
      .from("studio_projects")
      .insert({
        user_id: user.id,
        title,
        intent: text,
        rules: [],
        arc: null,
        thematic_territory: null,
        shelf_stage: "active",
        canvas_version: 1,
        composed_at: null,
      })
      .select("id")
      .single();
    if (projectError || !project) {
      console.error("quick-start project insert error:", projectError);
      return NextResponse.json({ success: false, error: `Failed to create project: ${projectError?.message ?? "unknown"}` }, { status: 500 });
    }
    const projectId = project.id as string;

    const { error: conceptError } = await supabase.from("studio_concept_revisions").insert({
      user_id: user.id,
      project_id: projectId,
      body: text,
      constraints: [],
      origin: "creation",
    });
    if (conceptError) console.error("quick-start concept revision error (non-fatal):", conceptError);

    const { data: node, error: nodeError } = await supabase
      .from("studio_nodes")
      .insert({
        user_id: user.id,
        project_id: projectId,
        parent_id: null,
        position: 0,
        title,
        intent: text,
        stands_whole: true,
        status: "open",
        open_threads: [],
        body: text,
      })
      .select("id")
      .single();
    if (nodeError || !node) {
      console.error("quick-start node insert error:", nodeError);
      await supabase.from("studio_projects").delete().eq("id", projectId);
      return NextResponse.json({ success: false, error: `Failed to create piece: ${nodeError?.message ?? "unknown"}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, project_id: projectId, node_id: node.id });
  } catch (error) {
    console.error("quick-start error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
