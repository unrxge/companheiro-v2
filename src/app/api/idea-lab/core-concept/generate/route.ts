import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface GenerateRequest {
  phase: number;
  conversation_history: ConversationMessage[];
  confirmed_sections: Record<string, string>;
}

interface GenerateResponse {
  content: Record<string, string>;
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    const body: GenerateRequest = await request.json();

    console.log('Generate API received:', {
      phase: body.phase,
      conversation_history_length: body.conversation_history?.length || 0,
      conversation_history: body.conversation_history,
      confirmed_sections: body.confirmed_sections,
    })

    if (!body.phase || body.phase < 1 || body.phase > 4 || !body.conversation_history) {
      console.error('Validation failed:', {
        hasPhase: !!body.phase,
        phaseValid: body.phase >= 1 && body.phase <= 4,
        hasConversationHistory: !!body.conversation_history,
      })
      return NextResponse.json({ content: {} }, { status: 400 });
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    let systemPrompt = "";
    let userPrompt = "";

    if (body.phase === 1) {
      systemPrompt = `You are distilling the core idea from a conceptualisation conversation. Your task is to:
1. Generate a one-sentence idea statement that captures the essence of what they want to create
2. Infer the arc (Breakaway, Beginning, Expansion, Integration) based on the conversation
3. Infer the thematic territory based on the themes discussed

Return as JSON:
{
  "one_sentence": "...",
  "arc": "...",
  "thematic_territory": "..."
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");

      userPrompt = `Based on this conceptualisation conversation, extract the core idea:\n\n${conversationText}`;
    } else if (body.phase === 2) {
      systemPrompt = `You are reflecting and improving conviction and emotional journey statements. The user provides their raw version first. Your role is to:
- Mirror back what you hear
- Clarify and deepen it
- Improve clarity while preserving their voice
- Return a polished version they can refine

Return as JSON:
{
  "reflected": "..."
}`;

      userPrompt = `Please reflect and improve this: "${body.confirmed_sections.user_input}"`;
    } else if (body.phase === 3) {
      systemPrompt = `You are distilling a core truth from a conviction statement. Your role is to:
- Extract the single most important truth underneath
- Make it concrete and memorable
- Keep it brief (1-2 sentences max)

Return as JSON:
{
  "core_truth": "..."
}`;

      userPrompt = `Distil the core truth from this conviction statement: "${body.confirmed_sections.conviction_statement}"`;
    } else if (body.phase === 4) {
      systemPrompt = `You are completing a core concept document by:
1. Generating goals for a Substack piece format
2. Generating goals for short-form content format
3. Identifying open threads from the full conversation that could be explored

Return as JSON:
{
  "substack_goals": "...",
  "short_form_goals": "...",
  "open_threads": "..."
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");

      userPrompt = `Based on this full conceptualisation conversation and confirmed conviction statement, generate format goals and open threads:\n\nConversation:\n${conversationText}\n\nConviction: ${body.confirmed_sections.conviction_statement}`;
    }

    let response;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      });
    } catch (apiError) {
      console.error("Claude API error:", apiError);
      throw apiError;
    }

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      console.error("No text content in response:", response.content);
      return NextResponse.json({ content: {} }, { status: 500 });
    }

    let content;
    try {
      const cleanedText = textContent.text.replace(/```json\n?|\n?```/g, "").trim();
      console.log("Cleaned text for parsing:", cleanedText);

      // Try to parse as-is first
      try {
        content = JSON.parse(cleanedText);
      } catch {
        // If truncated, attempt to close the JSON by finding the last complete field
        console.log("Parse failed, attempting truncation fix...");
        const truncationFix = cleanedText
          .replace(/,\s*"[^"]*":\s*"[^"]*$/, "") // remove last incomplete field
          .replace(/,\s*$/, "") // remove trailing comma
          + "}"; // close the object
        console.log("Truncation-fixed text:", truncationFix);
        content = JSON.parse(truncationFix);
      }
      return NextResponse.json({ content });
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.error("Raw text:", textContent.text);
      return NextResponse.json({ content: {} }, { status: 500 });
    }
  } catch (error) {
    console.error("Core concept generate error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    return NextResponse.json({ content: {} }, { status: 500 });
  }
}
