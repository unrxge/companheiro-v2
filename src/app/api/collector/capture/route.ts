import { NextRequest, NextResponse } from "next/server";
import type { ImageBlockParam, TextBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { MODELS } from "@/lib/models";
import { analyzeLink, type LinkContent } from "@/lib/link-analysis";

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
    link_context: string | null;
  };
  error?: string;
}

function describeLinkFacts(link: LinkContent): string {
  return [
    link.platform ? `Platform: ${link.platform}` : null,
    link.author ? `Author: ${link.author}` : null,
    link.title ? `Title: ${link.title}` : null,
    link.description ? `Caption/description: ${link.description}` : null,
    link.imageBase64 ? `A thumbnail/cover image of the content is attached.` : null,
  ]
    .filter(Boolean)
    .join("\n");
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

    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { supabase, user } = auth;
    const userId = user.id;

    // If a URL was shared, pull the real content signals — platform, caption,
    // author, thumbnail — so the capture interprets the content itself.
    const link = body.url?.trim() ? await analyzeLink(body.url.trim()) : null;

    const hasLinkContent = !!link && !!(link.title || link.description || link.imageBase64);

    const systemPrompt = `You are Companheiro, unpacking a brief note or voice transcript to see what's really there.

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
${
  hasLinkContent
    ? `
They shared a piece of content (details and possibly a thumbnail image are provided). Also produce "content_read": 2-3 sentences interpreting the content itself — what it is, what it's about, and crucially its FORMAT mechanics (how it's structured, what makes it work as a piece of content), since they often capture things whose format they want to put their own twist on. Read the thumbnail if provided.
`
    : ""
}
Format your response as JSON:
{
  "unpacked": "1-2 sentence clarification of the core idea",
  "arc": "Breakaway" | "Beginning" | "Expansion" | "Integration",
  "thematic_territory": "creativity_devotion_curiosity" | "healthy_masculinity_emotional_regulation" | "inner_child_tending_expression" | "slow_living_life_in_service"${
    hasLinkContent ? `,\n  "content_read": "2-3 sentence interpretation of the shared content and its format"` : ""
  }
}`;

    const userContent: Array<TextBlockParam | ImageBlockParam> = [];

    if (link?.imageBase64 && link.imageMediaType) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: link.imageMediaType,
          data: link.imageBase64,
        },
      });
    }

    userContent.push({
      type: "text",
      text: hasLinkContent
        ? `Their note: "${body.raw_input}"\n\n[Shared content details]\n${describeLinkFacts(link!)}\n\nUnpack this capture.`
        : `Unpack this input: "${body.raw_input}"`,
    });

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 500,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
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

    // Persist only Claude's own interpretation of the linked content — not
    // the platform/author/title metadata, which is source description, not
    // analysis.
    const linkContext: string | null = hasLinkContent && analysis.content_read
      ? analysis.content_read
      : null;

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
          link_context: linkContext,
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
        link_context: capture.link_context ?? null,
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
