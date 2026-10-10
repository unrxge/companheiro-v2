import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@/lib/anthropic";
import { requireUser } from "@/lib/supabase/route";
import { aiGate, pickModel } from "@/lib/billing/fair-use";
import { MODELS } from "@/lib/models";
import { getActivePortrait, formatPortraitForPrompt } from "@/lib/portrait";
import { withLanguage } from "@/lib/language";
import { logUsage } from "@/lib/usage-log";
import { buildIdeaPrompt, getRandomArcs, getRandomTerritories, overallRegister, pickFacetSeed, promptModelTier, type TerritoryInput } from "@/lib/idea-prompt";
import { classifyRegister, makesFrom } from "@/lib/territory-map";

// How the question itself is assembled lives in lib/idea-prompt.ts. This route
// reads the request, gathers what the builder needs and picks the model.

interface PromptRequest {
  arcs?: string[] | null;
  randomArcs?: boolean;
  territories?: TerritoryInput[] | null;
  randomTerritories?: boolean;
  energy?: string;
  impersonal?: boolean;
  /** The question on screen when "Ask again" was pressed. */
  previousPrompt?: string;
  /** Every question turned down in this sitting, most recent last. */
  rejected?: string[];
  /** How many times "Ask again" has been pressed in a row, this one included. */
  regeneration?: number;
}

interface PromptResponse {
  prompt: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<PromptResponse>> {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ prompt: "" }, { status: 401 });
    }
    const gated = await aiGate(auth);
    if (gated) return gated;

    const body: PromptRequest = await request.json();
    const previousPrompt = body.previousPrompt?.trim() || undefined;
    const rejected = (Array.isArray(body.rejected) ? body.rejected : previousPrompt ? [previousPrompt] : [])
      .map((p) => String(p).trim().slice(0, 400))
      .filter(Boolean)
      .slice(-5);

    const arcsSkipped = body.arcs === null;
    if (!arcsSkipped && (!body.arcs || body.arcs.length === 0) && !body.randomArcs) {
      return NextResponse.json({ prompt: "" }, { status: 400 });
    }

    const finalArcs = arcsSkipped ? [] : body.randomArcs ? getRandomArcs() : body.arcs || [];

    // Custom territories arrive as { key, label, custom: true, … } objects;
    // predefined territories arrive as plain key strings.
    let finalTerritories: TerritoryInput[] =
      body.territories === null
        ? []
        : body.randomTerritories
          ? getRandomTerritories()
          : body.territories ?? [];

    // A custom territory from before registers existed has not been sorted
    // yet (the Idea Lab does that in the background the first time it opens).
    // Sort it here so this question is already written the right way; its map
    // is still the old one, which the builder is told.
    const makes = makesFrom(auth.user);
    const labels = finalTerritories.map((t) => (typeof t === "string" ? "" : t.label));
    let looseMap = false;
    finalTerritories = await Promise.all(
      finalTerritories.map(async (t, i) => {
        if (typeof t === "string" || t.register) return t;
        const register = await classifyRegister(auth.user.id, t.label, { makes, otherThemes: labels.filter((l, j) => l && j !== i) });
        if (register === "field") looseMap = true;
        return { ...t, register };
      })
    );
    const register = overallRegister(finalTerritories);

    // One facet seed from the chosen territories forces a different corner of
    // the map each time. On "Ask again" it is the seed furthest from every
    // question already turned down.
    const facetSeed = pickFacetSeed(finalTerritories, rejected.length > 0 ? rejected.join(" ") : undefined);

    const isImpersonal = body.impersonal === true;

    // Portrait + active work context — only fetched in personal (charged) mode.
    // Grounds which specific facet the question lands on; stays invisible in output.
    // A question from someone's practice in a field is aimed by their work alone:
    // the portrait is about their inner life and would pull it back there.
    let groundingBlock = "";
    if (!isImpersonal) {
      const { supabase, user } = auth;
      // `studio_projects` is the complete dataset for active/queued work —
      // migration 009 copied every old `pieces`/`ideas` row here too, so
      // these are no longer a supplement to pieces/ideas queries, they're
      // the whole picture (queued covers both old queued pieces and ideas).
      const [portraitEntries, { data: activeStudioProjects }, { data: queuedStudioProjects }] = await Promise.all([
        register === "field" ? Promise.resolve([]) : getActivePortrait(auth),
        supabase
          .from("studio_projects")
          .select("title, arc, thematic_territory")
          .eq("user_id", user.id)
          .eq("shelf_stage", "active")
          .limit(8),
        supabase
          .from("studio_projects")
          .select("title, arc, thematic_territory")
          .eq("user_id", user.id)
          .eq("shelf_stage", "queued")
          .limit(8),
      ]);

      const contextParts: string[] = [];
      const portraitBlock = formatPortraitForPrompt(portraitEntries);
      if (portraitBlock) contextParts.push(portraitBlock);

      const activeLines = (activeStudioProjects || []).map(
        (p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory})`
      );
      if (activeLines.length > 0) {
        contextParts.push("WHAT'S ACTIVELY IN MOTION:\n" + activeLines.join("\n"));
      }

      const queuedLines = (queuedStudioProjects || []).map(
        (p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory})`
      );
      if (queuedLines.length > 0) {
        contextParts.push("IDEAS ALREADY QUEUED:\n" + queuedLines.join("\n"));
      }

      groundingBlock = contextParts.join("\n\n");
    }

    const { system, userMessage } = buildIdeaPrompt({
      arcs: finalArcs,
      territories: finalTerritories,
      energy: body.energy ?? "steady",
      impersonal: isImpersonal,
      facetSeed,
      rejected,
      groundingBlock,
      makes,
      looseMap,
    });

    // The first question and two more come from the fast model. Asked a third
    // time, the next three come from the deep one, then three fast, and so on.
    const regeneration = Number.isFinite(body.regeneration) ? Math.max(0, Math.floor(body.regeneration as number)) : rejected.length > 0 ? 1 : 0;
    const tier = promptModelTier(regeneration);

    const response = await anthropic.messages.create({
      model: tier === "deep" ? pickModel(auth, MODELS.deep) : MODELS.fast,
      max_tokens: 250,
      system: withLanguage(system),
      messages: [{ role: "user", content: userMessage }],
    });

    logUsage(auth.user.id, "idea-lab/prompt", response.model, response.usage, { register, regeneration });

    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json({ prompt: "" }, { status: 500 });
    }

    return NextResponse.json({ prompt: textContent.text.trim() });
  } catch (error) {
    console.error("Prompt generation error:", error);
    return NextResponse.json({ prompt: "" }, { status: 500 });
  }
}
