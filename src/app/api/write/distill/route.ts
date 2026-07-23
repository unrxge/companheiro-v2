import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";
import { distillPortrait } from "@/lib/portrait";

interface DistillMessage {
  role: "user" | "assistant";
  content: string;
}

interface DistillRequest {
  messages: DistillMessage[];
}

// Periodically (and on session-end) fed a slice of the write-chat transcript
// as it happens. Deliberately not scoped to any section or draft state — the
// value is in the excavation itself, not which prose it was nominally
// attached to. Distill-and-discard: this text is used once for one Claude
// call and never persisted.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const body: DistillRequest = await request.json();
    if (!body.messages || body.messages.length === 0) {
      return NextResponse.json({ success: true });
    }

    const conversationText = body.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

    await distillPortrait(auth, "writing", conversationText);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Write distill route error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
