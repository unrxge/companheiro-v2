import { NextRequest, NextResponse } from "next/server";

interface TestSaveResponse {
  success: boolean;
  message?: string;
  data?: {
    idea_id: string;
    piece_id: string;
  };
  error?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse<TestSaveResponse>> {
  try {
    // Hardcoded test data
    const testData = {
      one_sentence:
        "A practical guide to integrating daily mindfulness practices to cultivate emotional resilience and authentic self-expression.",
      arc: "Integration",
      thematic_territory: "inner_child_tending_expression",
      conviction_statement:
        "I believe that by gently tending to our inner child's needs for safety, creative expression, and unconditional acceptance, we unlock our capacity for genuine connection and meaningful creative work.",
      emotional_journey:
        "Starting from a place of self-criticism and emotional guardedness, moving through curiosity and compassion, arriving at profound acceptance and creative freedom.",
      core_truth:
        "Healing begins when we grant ourselves the same kindness we would offer a child—safe, seen, and free to create.",
      substack_goals:
        "Establish emotional safety as foundational. Share practical rituals. Make healing feel accessible, not clinical.",
      short_form_goals:
        "Quick wins on emotional self-care. Bite-sized permission slips for creative courage.",
      open_threads:
        "How do generational patterns of emotional suppression affect creative output?\nWhat does self-compassion look like in high-stress creative environments?\nHow can vulnerability become a creative strength?",
      conversation_history: [
        {
          role: "user",
          content:
            "I want to write about healing through creative expression and learning to be gentle with myself.",
        },
        {
          role: "assistant",
          content:
            "That's a deeply meaningful direction. There's something powerful about creativity as a form of self-compassion. What do you see as the core of this idea?",
        },
        {
          role: "user",
          content:
            "That when we're kind to ourselves—especially the younger, hurt parts—we access better creative work and show up more authentically.",
        },
        {
          role: "assistant",
          content:
            "I'm hearing both healing and creativity as intertwined. The observation that self-compassion unlocks authenticity is really central here. Does that feel true to you?",
        },
      ],
    };

    console.log("Test save route - calling save API with test data:", testData);

    // Call the actual save API internally
    const saveResponse = await fetch(
      `${process.env.NEXT_PUBLIC_VERCEL_URL ? "https://" + process.env.NEXT_PUBLIC_VERCEL_URL : "http://localhost:3000"}/api/idea-lab/core-concept/save`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Forward cookies to maintain authentication
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify(testData),
      }
    );

    const saveResult = await saveResponse.json();

    console.log("Test save API response:", saveResult);

    if (saveResult.success) {
      return NextResponse.json({
        success: true,
        message: "Test save completed successfully",
        data: {
          idea_id: saveResult.idea_id,
          piece_id: saveResult.piece_id,
        },
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: saveResult.error || "Save API returned error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Test save route error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
