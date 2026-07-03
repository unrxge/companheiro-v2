import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface Capture {
  id: string;
  raw_input: string;
  unpacked: string;
  arc: string;
  thematic_territory: string;
  link_context: string | null;
  created_at: string;
}

interface CapturesResponse {
  captures: Capture[];
}

export async function GET(_request: NextRequest): Promise<NextResponse<CapturesResponse>> {
  try {
    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json({ captures: [] }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: captures, error: queryError } = await supabase
      .from("captures")
      .select("id, raw_input, unpacked, arc, thematic_territory, url, link_context, created_at")
      .eq("user_id", userId)
      .eq("status", "captured")
      .order("created_at", { ascending: false })
      .limit(5);

    if (queryError) {
      console.error("Error fetching captures:", queryError);
      return NextResponse.json({ captures: [] });
    }

    return NextResponse.json({
      captures: (captures || []) as Capture[],
    });
  } catch (error) {
    console.error("Captures route error:", error);
    return NextResponse.json({ captures: [] }, { status: 500 });
  }
}
