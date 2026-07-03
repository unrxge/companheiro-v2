import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "@/lib/supabase/route";

interface CurrentTrajectoryResponse {
  trajectory: {
    statement: string;
    born_project: string | null;
    tone: string | null;
    created_at: string;
  } | null;
}

export async function GET(_request: NextRequest): Promise<NextResponse<CurrentTrajectoryResponse>> {
  try {
    const supabase = await createRouteClient();

    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData.user) {
      return NextResponse.json({ trajectory: null }, { status: 401 });
    }

    const { data: trajectory } = await supabase
      .from("trajectories")
      .select("statement, born_project, tone, created_at")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle();

    return NextResponse.json({ trajectory: trajectory || null });
  } catch (error) {
    console.error("Trajectory current route error:", error);
    return NextResponse.json({ trajectory: null }, { status: 500 });
  }
}
