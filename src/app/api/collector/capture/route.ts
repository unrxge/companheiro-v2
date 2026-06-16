import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CaptureRequest {
  raw_input: string;
  url?: string;
}

interface CaptureResponse {
  success: boolean;
  capture?: {
    id: string;
    raw_input: string;
    unpacked: string;
    arc: string;
    thematic_territory: string;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<CaptureResponse>> {
  try {
    const body: CaptureRequest = await request.json();

    if (!body.raw_input || !body.raw_input.trim()) {
      return NextResponse.json(
        { success: false, error: "raw_input is required" },
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

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Call Claude to unpack and infer arc & territory
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: `You are Companheiro, unpacking a brief note or voice transcript to see what's really there.

Your task:
1. Unpack into 1-2 sentences that name the core idea or observation—what's actually being said underneath the surface
2. Keep the original voice and tone intact; this is not a rewrite
3. Infer the arc: Breakaway, Beginning, Expansion, or Integration
4. Infer the thematic territory: creativity_devotion_curiosity, healthy_masculinity_emotional_regulation, inner_child_tending_expression, or slow_living_life_in_service

When unpacking, be direct and tender:
- Name the real thing (the contradiction, the weight, the curiosity underneath)
- Don't soften or explain
- Don't add filler words
- Every sentence carries weight

Format your response as JSON:
{
  "unpacked": "1-2 sentence clarification of the core idea",
  "arc": "Breakaway" | "Beginning" | "Expansion" | "Integration",
  "thematic_territory": "creativity_devotion_curiosity" | "healthy_masculinity_emotional_regulation" | "inner_child_tending_expression" | "slow_living_life_in_service"
}`,
      messages: [
        {
          role: "user",
          content: `Unpack this input: "${body.raw_input}"`,
        },
      ],
    });

    // Parse response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { success: false, error: "Failed to generate analysis" },
        { status: 500 }
      );
    }

    const cleanedText = textContent.text.replace(/```json\n?|\n?```/g, "").trim();
    const analysis = JSON.parse(cleanedText);

    // Insert into captures table
    const { data: captureData, error: insertError } = await supabase
      .from("captures")
      .insert([
        {
          user_id: userId,
          raw_input: body.raw_input,
          unpacked: analysis.unpacked,
          arc: analysis.arc,
          thematic_territory: analysis.thematic_territory,
          status: "captured",
          url: body.url || null,
        },
      ])
      .select();

    if (insertError || !captureData || captureData.length === 0) {
      console.error("Error inserting capture:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to save capture" },
        { status: 500 }
      );
    }

    const capture = captureData[0];

    return NextResponse.json({
      success: true,
      capture: {
        id: capture.id,
        raw_input: capture.raw_input,
        unpacked: capture.unpacked,
        arc: capture.arc,
        thematic_territory: capture.thematic_territory,
      },
    });
  } catch (error) {
    console.error("Collector capture error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
