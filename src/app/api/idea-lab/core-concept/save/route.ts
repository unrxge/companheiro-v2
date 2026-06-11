import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

    console.log('Save API received:', JSON.stringify(body, null, 2))

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
          title: body.one_sentence,
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

    // Convert open_threads string to array (split on numbered pattern like "1. ... 2. ...")
    const openThreadsArray = typeof body.open_threads === 'string'
      ? body.open_threads
          .split(/\d+\.\s+/)
          .map((t: string) => t.trim())
          .filter((t: string) => t.length > 0)
      : body.open_threads || [];
    console.log('Converted open_threads to array:', openThreadsArray)

    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .insert([
        {
          user_id: userId,
          idea_id: ideaId,
          title: body.one_sentence,
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
    console.log('Returning success response with idea_id and piece_id')

    return NextResponse.json({
      success: true,
      idea_id: ideaId,
      piece_id: pieceId,
    });
  } catch (error) {
    console.error("Core concept save error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
