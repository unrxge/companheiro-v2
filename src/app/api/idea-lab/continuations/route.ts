import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface Continuation {
  natural_continuations: string[];
  what_it_opened: string;
}

interface ContinuationsResponse {
  continuations: Continuation[];
}

export async function GET(_request: NextRequest): Promise<NextResponse<ContinuationsResponse>> {
  try {
    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json(
        { continuations: [] },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Fetch three most recent post-publication logs
    const { data: logs, error: logsError } = await supabase
      .from("post_publication_logs")
      .select("natural_continuations, what_it_opened")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    if (logsError) {
      console.error("Error fetching logs:", logsError);
      return NextResponse.json(
        { continuations: [] },
        { status: 500 }
      );
    }

    return NextResponse.json({
      continuations: (logs || []) as Continuation[],
    });
  } catch (error) {
    console.error("Continuations error:", error);
    return NextResponse.json(
      { continuations: [] },
      { status: 500 }
    );
  }
}
