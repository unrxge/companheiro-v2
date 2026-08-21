import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";
import { generateTasks } from "@/lib/generate-tasks";
import { generatePoeticTitle } from "@/lib/generate-poetic-title";
import { distillPortrait } from "@/lib/portrait";

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
}

interface SaveResponse {
  success: boolean;
  idea_id?: string;
  piece_id?: string;
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

function normaliseThematicTerritory(raw: string): string {
  const r = raw.toLowerCase();
  // Check inner_child_tending_expression FIRST (higher priority)
  if (
    r.includes("inner") ||
    r.includes("child") ||
    r.includes("express") ||
    r.includes("mental health") ||
    r.includes("self-compassion") ||
    r.includes("compassion") ||
    r.includes("darkness") ||
    r.includes("identity") ||
    r.includes("healing")
  )
    return "inner_child_tending_expression";
  if (
    r.includes("creativ") ||
    r.includes("devot") ||
    r.includes("curios")
  )
    return "creativity_devotion_curiosity";
  if (
    r.includes("mascul") ||
    r.includes("emotion") ||
    r.includes("regulat")
  )
    return "healthy_masculinity_emotional_regulation";
  if (
    r.includes("slow") ||
    r.includes("service") ||
    r.includes("simple") ||
    r.includes("living")
  )
    return "slow_living_life_in_service";
  return "creativity_devotion_curiosity"; // default fallback
}

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
    console.log('User authenticated:', userId)

    // Normalise arc and thematic territory to valid enum values
    const normalisedArc = normaliseArc(body.arc);
    const normalisedTerritory = normaliseThematicTerritory(body.thematic_territory);
    console.log('Normalised values:', {
      original_arc: body.arc,
      normalised_arc: normalisedArc,
      original_territory: body.thematic_territory,
      normalised_territory: normalisedTerritory,
    })

    // Generate the poetic title that will represent this idea/piece
    // everywhere in the UI until the user renames it while writing.
    const poeticTitle = await generatePoeticTitle({
      one_sentence: body.one_sentence,
      conviction_statement: body.conviction_statement,
      emotional_journey: body.emotional_journey,
      core_truth: body.core_truth,
    })
    console.log('Generated poetic title:', poeticTitle)

    // Create idea
    console.log('Creating idea with:', {
      user_id: userId,
      one_sentence: body.one_sentence,
      arc: normalisedArc,
      thematic_territory: normalisedTerritory,
    })

    const { data: ideaData, error: ideaError } = await supabase
      .from("ideas")
      .insert([
        {
          user_id: userId,
          title: poeticTitle,
          one_sentence: body.one_sentence,
          arc: normalisedArc,
          thematic_territory: normalisedTerritory,
          is_project: false,
          status: "ready",
          conceptualisation_log: body.conversation_history,
        },
      ])
      .select();

    if (ideaError || !ideaData || ideaData.length === 0) {
      console.error("Error creating idea:", ideaError);
      return NextResponse.json(
        { success: false, error: "Failed to save idea" },
        { status: 500 }
      );
    }

    const ideaId = ideaData[0].id;
    console.log('Idea created successfully:', ideaId)

    // Create piece
    console.log('Creating piece with idea_id:', ideaId)

    // Convert open_threads string to array — one thread per line, stripping any
    // leading bullet ("- ", "• ") or numbered ("1.", "1)") marker
    const openThreadsArray = typeof body.open_threads === 'string'
      ? body.open_threads
          .split('\n')
          .map((line: string) => line.replace(/^\s*[-•\d.)]+\s*/, '').trim())
          .filter((t: string) => t.length > 0)
      : body.open_threads || [];
    console.log('Converted open_threads to array:', openThreadsArray)

    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .insert([
        {
          user_id: userId,
          idea_id: ideaId,
          title: poeticTitle,
          arc: normalisedArc,
          thematic_territory: normalisedTerritory,
          format: "substack",
          stage: "conceptualising",
          conviction_statement: body.conviction_statement,
          emotional_journey: body.emotional_journey,
          core_truth: body.core_truth,
          substack_goals: body.substack_goals,
          short_form_goals: body.short_form_goals,
          open_threads: openThreadsArray,
          next_action: "Begin writing the Substack piece",
        },
      ])
      .select();

    if (pieceError || !pieceData || pieceData.length === 0) {
      console.error("Error creating piece:", pieceError);
      return NextResponse.json(
        { success: false, error: "Failed to save piece" },
        { status: 500 }
      );
    }

    const pieceId = pieceData[0].id;
    console.log('Piece created successfully:', pieceId)

    // Distill what this conceptualisation reveals about how they develop
    // ideas — never blocks on failure.
    const conversationText = body.conversation_history
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");
    await distillPortrait(
      { supabase, user: userData.user },
      "conceptualise",
      `${conversationText}\n\nConviction: ${body.conviction_statement}\nEmotional journey: ${body.emotional_journey}`
    );

    // Generate suggested tasks in-process (no HTTP round-trip)
    const suggestedTasks = await generateTasks({
      one_sentence: body.one_sentence,
      arc: normalisedArc,
      conviction_statement: body.conviction_statement,
      emotional_journey: body.emotional_journey,
      core_truth: body.core_truth,
      substack_goals: body.substack_goals,
      short_form_goals: body.short_form_goals,
    })

    let insertedTasks: Array<{ id: string; title: string; type: string }> = []
    if (suggestedTasks.length > 0) {
      const tasksToInsert = suggestedTasks.map((task, index) => ({
        user_id: userId,
        piece_id: pieceId,
        title: task.title,
        type: task.type,
        is_writing_related: task.is_writing_related,
        order: index,
        status: "pending",
      }))

      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
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
      idea_id: ideaId,
      piece_id: pieceId,
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
