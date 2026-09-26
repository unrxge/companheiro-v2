import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { aiGate, pickModel } from "@/lib/billing/fair-use";
import { MODELS } from "@/lib/models";
import { withLanguage } from "@/lib/language";
import { logUsage } from "@/lib/usage-log";

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

function getConfirmedField(
  confirmedSections: Record<string, string>,
  phaseKey: string,
  field: string
): string {
  const raw = confirmedSections[phaseKey];
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    return parsed[field] || "";
  } catch {
    return "";
  }
}

// A multi-line field (the emotional journey) sometimes arrives with real
// newlines inside the JSON string instead of an escaped \n, which JSON.parse rejects.
function escapeNewlinesInStrings(json: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString && ch === "\\") { out += ch + (json[i + 1] ?? ""); i++; continue; }
    if (ch === '"') inString = !inString;
    out += inString && ch === "\n" ? "\\n" : ch;
  }
  return out;
}

export async function POST(request: NextRequest): Promise<NextResponse<GenerateResponse>> {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ content: {} }, { status: 401 });
    }
    const gated = await aiGate(auth);
    if (gated) return gated;

    const body: GenerateRequest = await request.json();

    if (!body.phase || body.phase < 1 || body.phase > 4 || !body.conversation_history) {
      return NextResponse.json({ content: {} }, { status: 400 });
    }

    let systemPrompt = "";
    let userPrompt = "";

    if (body.phase === 1) {
      systemPrompt = `You are distilling the core idea from a conceptualisation conversation. Your task is to:
1. Generate a one-sentence idea statement that captures the essence of what they want to create
2. Infer the arc (Breakaway, Beginning, Expansion, Integration) based on the conversation
3. Name the theme this particular piece is about, in your own words: a short phrase of one to five words, in sentence case (for example "Chasing validation" or "The weight of inheritance"). Let the piece itself decide it. Do not reach for a category, a pillar, or a stock label — the person may be exploring something far from anything they have made before.

Return as JSON:
{
  "one_sentence": "...",
  "arc": "Breakaway" | "Beginning" | "Expansion" | "Integration",
  "thematic_territory": "<the theme, one to five words>"
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");

      userPrompt = `Based on this conceptualisation conversation, extract the core idea:\n\n${conversationText}`;
    } else if (body.phase === 2) {
      systemPrompt = `You are distilling a conviction statement and emotional journey from a conceptualisation conversation.

Conviction statement: the single belief or stance driving this piece — what the writer is standing for, in their own words.
Emotional journey: the arc of feeling the audience moves through, start to end. The audience is whoever receives the work, however they meet it (reading it, hearing it, seeing it), so describe what they feel, not the medium.

Write the emotional journey as an ordered list of beats, one beat per line, each in exactly this shape:
Short label — one sentence on what the audience feels or goes through here
The label is a summary of one to six words ("Recognition in the body", "The cost of the chase", "Held without resolution"). Use as many beats as this piece's real journey has — commonly three to seven — and do not pad or trim to hit a number. Separate the lines with \\n inside the JSON string.

Preserve the person's own voice and language from the conversation — this is a distillation of what they already said, not an invention. Keep the conviction statement to 2-4 sentences.

Return as JSON:
{
  "conviction_statement": "...",
  "emotional_journey": "Label — sentence\\nLabel — sentence\\nLabel — sentence"
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
      const oneSentence = getConfirmedField(body.confirmed_sections, "phase1", "one_sentence");

      userPrompt = `Based on this conceptualisation conversation, distil the conviction statement and emotional journey:\n\n${conversationText}${
        oneSentence ? `\n\nCore idea (already confirmed): "${oneSentence}"` : ""
      }`;
    } else if (body.phase === 3) {
      systemPrompt = `You are distilling a core truth from a conviction statement. Your role is to:
- Extract the single most important truth underneath
- Make it concrete and memorable
- Keep it brief (1-2 sentences max)

Return as JSON:
{
  "core_truth": "..."
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
      const convictionStatement = getConfirmedField(body.confirmed_sections, "phase2", "conviction_statement");

      userPrompt = `Distil the core truth from this conviction statement: "${convictionStatement}"\n\nFull conversation for context:\n${conversationText}`;
    } else if (body.phase === 4) {
      systemPrompt = `You are completing a core concept document by:
1. Generating goals for a Substack piece format
2. Generating goals for short-form content format
3. Identifying open threads from the full conversation that could be explored

Format each of the three fields as bullet points: one goal or thread per line, each line starting with "- ". Be succinct and precise — no filler, no restating the same point twice. 2-4 bullets per field is usually enough.

Return as JSON:
{
  "substack_goals": "- ...\\n- ...",
  "short_form_goals": "- ...\\n- ...",
  "open_threads": "- ...\\n- ..."
}`;

      const conversationText = body.conversation_history
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n\n");
      const convictionStatement = getConfirmedField(body.confirmed_sections, "phase2", "conviction_statement");

      userPrompt = `Based on this full conceptualisation conversation and confirmed conviction statement, generate format goals and open threads:\n\nConversation:\n${conversationText}\n\nConviction: ${convictionStatement}`;
    }

    // Phases 1-3 distil the conversation down to a sentence or two of real
    // judgement (the core idea, the conviction, the underlying truth) —
    // worth the deep model. Phase 4 is pure formatting: turning an already-
    // confirmed conviction into bullet lists, extraction with no craft call
    // to make, so it runs on the fast model like the rest of that tier.
    const phaseModel = pickModel(auth, body.phase === 4 ? MODELS.fast : MODELS.deep);

    let response;
    try {
      response = await anthropic.messages.create({
        model: phaseModel,
        max_tokens: 4000,
        system: withLanguage(systemPrompt),
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

    logUsage(auth.user.id, "idea-lab/core-concept/generate", response.model, response.usage, { phase: body.phase });

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
        content = JSON.parse(escapeNewlinesInStrings(cleanedText));
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
