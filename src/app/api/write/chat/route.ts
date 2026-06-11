import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ChatRequest {
  message: string;
  piece_id: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ChatResponse {
  response: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ChatResponse>> {
  try {
    const body: ChatRequest = await request.json();

    if (!body.message || !body.piece_id) {
      return NextResponse.json(
        { response: "" },
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
        { response: "" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Fetch piece with core concept fields
    const { data: pieceData, error: pieceError } = await supabase
      .from("pieces")
      .select(
        "conviction_statement, emotional_journey, core_truth, substack_draft"
      )
      .eq("id", body.piece_id)
      .eq("user_id", userId)
      .single();

    if (pieceError || !pieceData) {
      return NextResponse.json(
        { response: "" },
        { status: 404 }
      );
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `You are a writing companion for a Substack piece. You know the piece deeply:

Conviction Statement: ${pieceData.conviction_statement || "(not provided)"}

Emotional Journey: ${pieceData.emotional_journey || "(not provided)"}

Core Truth: ${pieceData.core_truth || "(not provided)"}

Current Draft:
${pieceData.substack_draft || "(writer hasn't started yet)"}

Your role is to help the writer think through their piece. You ask clarifying questions, suggest angles, help unstick sections, and challenge ideas to deepen them. You never rewrite unless explicitly asked. You're thoughtful, direct, like a trusted creative collaborator. Keep responses concise and focused.`;

    const messages = [
      ...body.conversation_history,
      { role: "user" as const, content: body.message },
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      system: systemPrompt,
      messages: messages,
    });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { response: "" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      response: textContent.text,
    });
  } catch (error) {
    console.error("Chat error:", error);
    return NextResponse.json(
      { response: "" },
      { status: 500 }
    );
  }
}
