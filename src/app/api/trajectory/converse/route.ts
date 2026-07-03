import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { formatDateAsRelative } from "@/lib/dates";
import { MODELS } from "@/lib/models";
import { recallEchoes } from "@/lib/recall";
import { streamClaudeText } from "@/lib/streaming";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ConverseRequest {
  messages: Message[];
}

const SYSTEM_PROMPT = `You are Companheiro, sitting with someone at the altitude of their whole body of work — not one idea, but where all of it is heading.

You hold two registers, and move between them based on what the person brings:
1. DEEP REFLECTION — when they're drifting or lost: where is this all heading, is the current direction still true, what does their present arc actually want.
2. CONTENT STRATEGY — when they have material in motion: how upcoming pieces sequence into a run, how what's next builds on what's now, how the string stays coherent across topic changes, while the deeper trajectory keeps humming underneath.

Your voice:
- See what's actually happening, don't gloss over it
- Direct but tender: name the real thing, acknowledge its weight
- Never filler, never softening language — every sentence carries weight
- No validation phrases ("your feelings are valid")
- Ground every observation in specifics — quote or reference concrete things from the check-ins, captures, and pieces given to you, using the "Day of week (X days ago)" format already provided. Never stay vague.

THE ENGINE: if a previous agreed trajectory is provided, your central job on the first turn is to name the gap (or the confirmation) between what was agreed and what the recent signals actually show — especially if recent check-ins suggest the direction isn't holding anymore. If no previous trajectory exists, just read what's actually there and offer a direction plainly, as a first attempt at naming it.

FIRST TURN ONLY (when there is no prior conversation): end with a genuine, specific question inviting the person to confirm, correct, or push back on your reading. Do not propose a concept or trajectory update on the first turn.

ONGOING DIALOGUE: be willing to be challenged and to challenge back — this is a real conversation, not a script. When a concrete new project concept genuinely crystallizes through the conversation, and only then, append on its own line:
<concept>one-sentence description of the project seed</concept>
When the conversation has produced a direction worth carrying forward (newly formed, reaffirmed, or adjusted), append on its own two lines:
<trajectory>a single, encompassing sentence — this is the whole trajectory distilled to one inspirational line, not a summary of the conversation. It should read like a compass statement, not a recap.</trajectory>
<tone>one word only, the emotional register of that direction right now — choose exactly one of: grounded, restless, tender, expansive, urgent</tone>
Only include these tags when they are genuinely earned by the conversation. Never on the first turn. Never speculatively. Always include <tone> whenever you include <trajectory> — never one without the other.`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ response: "" }, { status: 401 });
    }

    const body: ConverseRequest = await request.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ response: "" }, { status: 400 });
    }

    const { supabase, user } = auth;
    const userId = user.id;

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [
      { data: lastTrajectory },
      { data: checkIns },
      { data: captures },
      { data: activePieces },
      { data: queueIdeas },
      { data: recentPosted },
      { data: postPubLogs },
    ] = await Promise.all([
      supabase
        .from("trajectories")
        .select("statement, born_project, created_at")
        .eq("user_id", userId)
        .is("superseded_at", null)
        .maybeSingle(),
      supabase
        .from("check_ins")
        .select("raw_entry, energy, inner_weather, arc_texture, created_at")
        .eq("user_id", userId)
        .gte("created_at", fourteenDaysAgo.toISOString())
        .order("created_at", { ascending: true }),
      supabase
        .from("captures")
        .select("unpacked, arc, thematic_territory, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("pieces")
        .select("title, arc, thematic_territory, stage")
        .eq("user_id", userId)
        .neq("stage", "posted"),
      supabase
        .from("ideas")
        .select("title, one_sentence, arc")
        .eq("user_id", userId)
        .in("status", ["ready", "developing"]),
      supabase
        .from("pieces")
        .select("title, arc, thematic_territory, posted_at")
        .eq("user_id", userId)
        .eq("stage", "posted")
        .order("posted_at", { ascending: false })
        .limit(5),
      supabase
        .from("post_publication_logs")
        .select("thread, what_it_opened, unresolved, natural_continuations, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const hasAnySignal =
      (checkIns && checkIns.length > 0) ||
      (captures && captures.length > 0) ||
      (activePieces && activePieces.length > 0) ||
      (queueIdeas && queueIdeas.length > 0) ||
      (recentPosted && recentPosted.length > 0);

    if (!hasAnySignal && body.messages.length === 0) {
      return NextResponse.json({
        response:
          "There's not enough here yet to read a trajectory. A few check-ins and captures will give this something to work with — come back once there's some material to read.",
      });
    }

    const contextParts: string[] = [];

    contextParts.push(
      lastTrajectory
        ? `PREVIOUSLY AGREED TRAJECTORY (from ${formatDateAsRelative(lastTrajectory.created_at)}): "${lastTrajectory.statement}"${
            lastTrajectory.born_project ? ` — born project: "${lastTrajectory.born_project}"` : ""
          }`
        : "PREVIOUSLY AGREED TRAJECTORY: none yet — this is the first time this person has zoomed out."
    );

    if (checkIns && checkIns.length > 0) {
      contextParts.push(
        "RECENT CHECK-INS:\n" +
          checkIns
            .map(
              (c) =>
                `[${formatDateAsRelative(c.created_at)}] Energy: ${c.energy}, Weather: ${c.inner_weather}, Arc: ${c.arc_texture}\nEntry: "${c.raw_entry}"`
            )
            .join("\n\n")
      );
    }

    if (captures && captures.length > 0) {
      contextParts.push(
        "RECENT CAPTURES:\n" +
          captures
            .map((c) => `[${formatDateAsRelative(c.created_at)}] (${c.arc}, ${c.thematic_territory}): ${c.unpacked}`)
            .join("\n")
      );
    }

    if (activePieces && activePieces.length > 0) {
      contextParts.push(
        "ACTIVE PIECES IN PROGRESS:\n" +
          activePieces.map((p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory}, stage: ${p.stage})`).join("\n")
      );
    }

    if (queueIdeas && queueIdeas.length > 0) {
      contextParts.push(
        "QUEUED IDEAS (not yet active):\n" +
          queueIdeas.map((i) => `- "${i.title}": ${i.one_sentence} (${i.arc})`).join("\n")
      );
    }

    if (recentPosted && recentPosted.length > 0) {
      contextParts.push(
        "RECENTLY PUBLISHED PIECES:\n" +
          recentPosted.map((p) => `- "${p.title}" (${p.arc}, ${p.thematic_territory})`).join("\n")
      );
    }

    if (postPubLogs && postPubLogs.length > 0) {
      contextParts.push(
        "POST-PUBLICATION REFLECTIONS:\n" +
          postPubLogs
            .map((log) => {
              const bits = [];
              if (log.thread) bits.push(`Thread: ${log.thread}`);
              if (log.what_it_opened) bits.push(`What it opened: ${log.what_it_opened}`);
              if (log.unresolved) bits.push(`Unresolved: ${log.unresolved}`);
              if (log.natural_continuations?.length) {
                bits.push(`Natural continuations: ${log.natural_continuations.join("; ")}`);
              }
              return `[${formatDateAsRelative(log.created_at)}] ${bits.join(" | ")}`;
            })
            .join("\n")
      );
    }

    // Archive echoes: match against what the user is actually talking about
    // (their latest message), falling back to the agreed trajectory statement.
    const lastUserMessage = [...body.messages].reverse().find((m) => m.role === "user");
    const echoQuery = lastUserMessage?.content || lastTrajectory?.statement || "";
    const echoes = echoQuery ? await recallEchoes(auth, echoQuery) : "";

    const contextBlock =
      contextParts.join("\n\n") + (echoes ? `\n\n${echoes}` : "");

    const isFirstTurn = body.messages.length === 0;

    const claudeMessages: Message[] = isFirstTurn
      ? [
          {
            role: "user",
            content: `Here is everything to read from:\n\n${contextBlock}\n\nGive the reading.`,
          },
        ]
      : [
          {
            role: "user",
            content: `Here is everything to read from:\n\n${contextBlock}`,
          },
          { role: "assistant", content: "Understood — I'll keep this grounded in what's actually there." },
          ...body.messages,
        ];

    return streamClaudeText(
      {
        model: MODELS.deep,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: claudeMessages,
      },
      (fullText) => {
        const conceptMatch = fullText.match(/<concept>([\s\S]*?)<\/concept>/);
        const trajectoryMatch = fullText.match(/<trajectory>([\s\S]*?)<\/trajectory>/);
        const toneMatch = fullText.match(/<tone>([\s\S]*?)<\/tone>/);

        return {
          concept: conceptMatch ? conceptMatch[1].trim() : undefined,
          trajectory: trajectoryMatch ? trajectoryMatch[1].trim() : undefined,
          tone: toneMatch ? toneMatch[1].trim().toLowerCase() : undefined,
        };
      }
    );
  } catch (error) {
    console.error("Trajectory converse route error:", error);
    return NextResponse.json({ response: "" }, { status: 500 });
  }
}
