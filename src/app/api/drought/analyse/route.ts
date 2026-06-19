import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CheckIn {
  raw_entry: string;
  energy: "low" | "medium" | "high";
  inner_weather: string;
  creative_readiness: boolean;
  arc_texture: "Breakaway" | "Beginning" | "Expansion" | "Integration";
  created_at: string;
}

interface AnalysisResponse {
  observation: string | null;
  pattern_type?: "energy" | "arc" | "creative";
}

function formatDateAsRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });
  return `${dayOfWeek} (${daysAgo} days ago)`;
}

function detectDrought(checkIns: CheckIn[]): boolean {
  if (checkIns.length < 2) return false;
  const lowEnergyCount = checkIns.filter((c) => c.energy === "low").length;
  return lowEnergyCount >= Math.ceil(checkIns.length * 0.5);
}

export async function POST(_request: NextRequest): Promise<NextResponse<AnalysisResponse>> {
  try {
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
      return NextResponse.json({ observation: null }, { status: 401 });
    }

    const userId = userData.user.id;

    // Query last 7 days of check-ins
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: checkIns, error: queryError } = await supabase
      .from("check_ins")
      .select("raw_entry, energy, inner_weather, creative_readiness, arc_texture, created_at")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: true });

    if (queryError || !checkIns || checkIns.length === 0) {
      return NextResponse.json({ observation: null });
    }

    // Check if there's an actual drought pattern
    if (!detectDrought(checkIns as CheckIn[])) {
      return NextResponse.json({ observation: null });
    }

    // Build pattern summary for Claude
    const energyDistribution = {
      low: (checkIns as CheckIn[]).filter((c) => c.energy === "low").length,
      medium: (checkIns as CheckIn[]).filter((c) => c.energy === "medium").length,
      high: (checkIns as CheckIn[]).filter((c) => c.energy === "high").length,
    };

    const arcDistribution = (checkIns as CheckIn[]).reduce(
      (acc, c) => {
        acc[c.arc_texture] = (acc[c.arc_texture] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const creativeReadinessCount = (checkIns as CheckIn[]).filter((c) => c.creative_readiness).length;

    const innerWeatherThemes = (checkIns as CheckIn[])
      .map((c) => c.inner_weather)
      .filter((w) => w);

    const checkInsSummary = (checkIns as CheckIn[])
      .map((c) => {
        const formattedDate = formatDateAsRelative(c.created_at);
        return `[${formattedDate}]
Energy: ${c.energy}
Weather: ${c.inner_weather}
Arc: ${c.arc_texture}
Creative readiness: ${c.creative_readiness ? "yes" : "no"}
Entry: "${c.raw_entry}"`;
      })
      .join("\n\n");

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Call Claude for pattern analysis
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: `You are Companheiro, noticing genuine patterns in someone's inner life over time.

Your voice:
- See what's actually happening in the patterns (don't gloss over it)
- Speak like a companion who's been listening closely
- Observations are direct but tender: name the real thing, acknowledge the weight
- Only surface a pattern if something truly significant emerges
- Never clinical, never filler — every word carries weight

CRITICAL: When you reference specific days or moments in your observation, you MUST include:
1. The formatted date already provided (e.g., "Monday (3 days ago)")
2. A direct quote or concrete detail from what they said on that day
Example: "On Monday (3 days ago) when you said 'the heaviness won't lift,' you were naming exactly where you were."

Always ground your observations in their actual words and experiences, not abstractions.

When you find a meaningful pattern, name it directly then classify as:
- "energy": patterns in energy levels or vitality
- "arc": patterns in arc texture (the narrative shape of their inner life)
- "creative": patterns in creative readiness or creative flow

Format as JSON:
{
  "has_observation": boolean,
  "observation": string (only if has_observation is true; direct statement of the pattern with concrete examples and quotes, then recognition of its weight),
  "pattern_type": "energy" | "arc" | "creative" (only if has_observation is true)
}

If no meaningful pattern exists, return { "has_observation": false }.`,
      messages: [
        {
          role: "user",
          content: `Analyze these 7 days of check-ins for patterns:

Energy distribution: ${JSON.stringify(energyDistribution)}
Arc texture distribution: ${JSON.stringify(arcDistribution)}
Creative readiness: ${creativeReadinessCount} out of ${(checkIns as CheckIn[]).length} entries
Inner weather themes: ${innerWeatherThemes.join(", ")}

Detailed entries:
${checkInsSummary}

Look for genuine patterns that might be worth noticing.`,
        },
      ],
    });

    // Parse response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ observation: null });
    }

    const cleanedText = textContent.text.replace(/```json\n?|\n?```/g, '').trim();
    const analysisResult = JSON.parse(cleanedText);

    if (!analysisResult.has_observation) {
      return NextResponse.json({ observation: null });
    }

    return NextResponse.json({
      observation: analysisResult.observation,
      pattern_type: analysisResult.pattern_type,
    });
  } catch (error) {
    console.error("Drought analysis error:", error);
    return NextResponse.json({ observation: null }, { status: 500 });
  }
}
