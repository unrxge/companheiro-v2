import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { generateTasks } from "@/lib/generate-tasks";
import { generatePoeticTitle } from "@/lib/generate-poetic-title";
import { distillPortrait } from "@/lib/portrait";
import { getUserTerritories } from "@/lib/territories-server";
import { resolveTerritoryKey } from "@/lib/territories";

interface SaveRequest {
  one_sentence: string;
  arc: string;
  thematic_territory: string;
  conviction_statement: string;
  emotional_journey: string;
  core_truth: string;
  substack_goals: string;
  short_form_goals: string;
  open_threads: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  /** The idea as the person first brought it, when they came via "Bring an idea". */
  brought_idea?: string | null;
  /** Building the core concept later for a project that already exists
   *  (it was started via "Skip to writing"): update it, don't create one. */
  project_id?: string | null;
}

interface SaveResponse {
  success: boolean;
  project_id?: string;
  node_id?: string;
  tasks?: Array<{ id: string; title: string; type: string }>;
  error?: string;
}

function normaliseArc(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("breakaway") || r.includes("break away")) return "Breakaway";
  if (r.includes("begin") || r.includes("start")) return "Beginning";
  if (r.includes("expan")) return "Expansion";
  if (r.includes("integrat") || r.includes("becom")) return "Integration";
  return "Beginning"; // default fallback
}

// Saves a locked Core Concept document as a Studio project: one studio_projects
// row (the shelf-level container, carrying the Lens and the write-journey
// lane) plus one root studio_nodes row (parent_id null — the piece itself,
// carrying every Gather/Shape/Write/Test field Write mode reads). This is the
// Phase 3 rewiring of Idea Lab's creation flow off pieces/ideas and onto the
// node/thread model (see studio/supabase/migrations/007_project_arc_and_tasks.sql
// for the arc/thematic_territory + studio_tasks schema this depends on).
//
// Deliberately does NOT touch pieces/ideas/tasks — those tables and the old
// Project Board stay live, untouched, for pieces created before this change.
export async function POST(request: NextRequest): Promise<NextResponse<SaveResponse>> {
  try {
    const body: SaveRequest = await request.json();

    // Validate required fields
    if (!body.one_sentence || !body.arc || !body.thematic_territory) {
      console.error('Validation failed - missing required fields:', {
        one_sentence: !!body.one_sentence,
        arc: !!body.arc,
        thematic_territory: !!body.thematic_territory,
      })
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Normalise arc and thematic territory to valid enum values
    const normalisedArc = normaliseArc(body.arc);
    const territories = await getUserTerritories({ supabase, user: userData.user });
    const normalisedTerritory = resolveTerritoryKey(body.thematic_territory, territories) ?? body.thematic_territory;
    console.log('Normalised values:', {
      original_arc: body.arc,
      normalised_arc: normalisedArc,
      original_territory: body.thematic_territory,
      normalised_territory: normalisedTerritory,
    })

    if (body.project_id) {
      return await completeExistingProject(supabase, userId, body, normalisedArc, normalisedTerritory);
    }

    // Generate the poetic title that will represent this idea/piece
    // everywhere in the UI until the user renames it while writing.
    const poeticTitle = await generatePoeticTitle({
      one_sentence: body.one_sentence,
      conviction_statement: body.conviction_statement,
      emotional_journey: body.emotional_journey,
      core_truth: body.core_truth,
    })
    console.log('Generated poetic title:', poeticTitle)

    // Convert open_threads string to array — one thread per line, stripping any
    // leading bullet ("- ", "• ") or numbered ("1.", "1)") marker
    const openThreadsArray = typeof body.open_threads === 'string'
      ? body.open_threads
          .split('\n')
          .map((line: string) => line.replace(/^\s*[-•\d.)]+\s*/, '').trim())
          .filter((t: string) => t.length > 0)
      : body.open_threads || [];
    console.log('Converted open_threads to array:', openThreadsArray)

    // If the conversation has a single user message it came from "Bring an idea".
    // Store that text as the root node's body so the write flow can ingest it —
    // same convention pieces.substack_draft used, and the same plain-text shape
    // (root.body only becomes HTML once Write mode's own editor touches it).
    const bringIdeaDraft =
      body.brought_idea?.trim() ||
      (body.conversation_history.length === 1 &&
      body.conversation_history[0].role === 'user'
        ? body.conversation_history[0].content.trim()
        : null)

    // Create the project (the shelf-level container).
    console.log('Creating studio project for:', poeticTitle)
    const { data: projectData, error: projectError } = await supabase
      .from("studio_projects")
      .insert([
        {
          user_id: userId,
          title: poeticTitle,
          intent: body.conviction_statement,
          rules: [],
          arc: normalisedArc,
          thematic_territory: normalisedTerritory,
          shelf_stage: "active",
          canvas_version: 1,
          composed_at: null,
        },
      ])
      .select("id")
      .single();

    if (projectError || !projectData) {
      console.error("Error creating studio project:", projectError);
      return NextResponse.json(
        { success: false, error: "Failed to save project" },
        { status: 500 }
      );
    }

    const projectId = projectData.id as string;

    // The back-and-forth that shaped this, kept for re-reading from the board.
    // Separate from the insert so a missing column (migration 023 not yet
    // applied) never blocks saving the project itself.
    if (body.conversation_history.length > 1) {
      const { error: logError } = await supabase
        .from("studio_projects")
        .update({ conceptualisation_log: body.conversation_history })
        .eq("id", projectId);
      if (logError) console.error("Error saving conceptualisation log (non-fatal):", logError);
    }
    console.log('Studio project created successfully:', projectId)

    // A creation concept revision, so the board's vision block has something
    // to show — mirrors what /api/studio/projects POST does for projects
    // created from the Studio's own "new project" flow.
    const { error: conceptError } = await supabase.from("studio_concept_revisions").insert({
      user_id: userId,
      project_id: projectId,
      body: body.conviction_statement || body.one_sentence,
      constraints: [],
      origin: "creation",
    });
    if (conceptError) {
      console.error("Error creating concept revision (non-fatal):", conceptError);
    }

    // Create the root node — the piece itself. parent_id null puts it at the
    // top of the project; Write mode's children (sections) nest under it.
    const { data: nodeData, error: nodeError } = await supabase
      .from("studio_nodes")
      .insert([
        {
          user_id: userId,
          project_id: projectId,
          parent_id: null,
          position: 0,
          title: poeticTitle,
          intent: body.conviction_statement,
          stands_whole: true,
          status: "open",
          emotional_journey: body.emotional_journey,
          core_truth: body.core_truth,
          substack_goals: body.substack_goals,
          short_form_goals: body.short_form_goals,
          open_threads: openThreadsArray,
          writing_ethos: null, // left blank for Gather to fill later
          body: bringIdeaDraft ?? "",
        },
      ])
      .select("id")
      .single();

    if (nodeError || !nodeData) {
      console.error("Error creating root node:", nodeError);
      // Never leave a half-made project on the shelf.
      await supabase.from("studio_projects").delete().eq("id", projectId);
      return NextResponse.json(
        { success: false, error: "Failed to save piece" },
        { status: 500 }
      );
    }

    const nodeId = nodeData.id as string;
    console.log('Root node created successfully:', nodeId)

    // Run portrait distillation and task generation in parallel — both are
    // independent of each other and were previously sequential, adding ~2s
    // to every save. distillPortrait never blocks on failure.
    const conversationText = body.conversation_history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");
    const [, suggestedTasks] = await Promise.all([
      distillPortrait(
        { supabase, user: userData.user },
        "conceptualise",
        `${conversationText}\n\nConviction: ${body.conviction_statement}\nEmotional journey: ${body.emotional_journey}`
      ),
      generateTasks({
        one_sentence: body.one_sentence,
        arc: normalisedArc,
        conviction_statement: body.conviction_statement,
        emotional_journey: body.emotional_journey,
        core_truth: body.core_truth,
        substack_goals: body.substack_goals,
        short_form_goals: body.short_form_goals,
      }),
    ])

    let insertedTasks: Array<{ id: string; title: string; type: string }> = []
    if (suggestedTasks.length > 0) {
      const tasksToInsert = suggestedTasks.map((task, index) => ({
        user_id: userId,
        project_id: projectId,
        node_id: nodeId,
        title: task.title,
        type: task.type,
        is_writing_related: task.is_writing_related,
        order: index,
        status: "pending",
      }))

      const { data: tasksData, error: tasksError } = await supabase
        .from("studio_tasks")
        .insert(tasksToInsert)
        .select("id, title, type")

      if (tasksError) {
        console.error("Error inserting tasks:", tasksError)
      } else {
        insertedTasks = tasksData || []
      }
    }

    return NextResponse.json({
      success: true,
      project_id: projectId,
      node_id: nodeId,
      tasks: insertedTasks,
    })
  } catch (error) {
    console.error("Core concept save error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

function toThreadArray(raw: unknown): string[] {
  return typeof raw === "string"
    ? raw.split("\n").map((line) => line.replace(/^\s*[-•\d.)]+\s*/, "").trim()).filter((x) => x.length > 0)
    : Array.isArray(raw) ? (raw as string[]) : [];
}

// The core concept arriving after the fact: fills the project's lens and
// vision and the root piece's concept fields. Title and body are the
// person's own by now, so neither is touched. No task generation — they're
// already writing.
async function completeExistingProject(
  supabase: Awaited<ReturnType<typeof createRouteClient>>,
  userId: string,
  body: SaveRequest,
  arc: string,
  territory: string,
): Promise<NextResponse<SaveResponse>> {
  const projectId = body.project_id as string;
  const { data: root, error: rootError } = await supabase
    .from("studio_nodes")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("parent_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (rootError || !root) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    arc,
    thematic_territory: territory,
    intent: body.conviction_statement,
  };
  if (body.conversation_history.length > 1) update.conceptualisation_log = body.conversation_history;
  let { error: projectError } = await supabase.from("studio_projects").update(update).eq("id", projectId).eq("user_id", userId);
  if (projectError && update.conceptualisation_log) {
    delete update.conceptualisation_log; // migration 023 not applied yet
    ({ error: projectError } = await supabase.from("studio_projects").update(update).eq("id", projectId).eq("user_id", userId));
  }
  if (projectError) {
    console.error("Core concept (existing project) update error:", projectError);
    return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 });
  }

  await supabase.from("studio_concept_revisions").insert({
    user_id: userId,
    project_id: projectId,
    body: body.conviction_statement || body.one_sentence,
    constraints: [],
    origin: "edit",
  });

  const { error: nodeError } = await supabase
    .from("studio_nodes")
    .update({
      intent: body.conviction_statement,
      emotional_journey: body.emotional_journey,
      core_truth: body.core_truth,
      substack_goals: body.substack_goals,
      short_form_goals: body.short_form_goals,
      open_threads: toThreadArray(body.open_threads),
    })
    .eq("id", root.id);
  if (nodeError) {
    console.error("Core concept (existing project) node update error:", nodeError);
    return NextResponse.json({ success: false, error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true, project_id: projectId, node_id: root.id as string, tasks: [] });
}
