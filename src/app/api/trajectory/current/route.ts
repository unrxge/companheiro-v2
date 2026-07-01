import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CurrentTrajectoryResponse {
  trajectory: {
    statement: string;
    born_project: string | null;
    created_at: string;
  } | null;
}

export async function GET(_request: NextRequest): Promise<NextResponse<CurrentTrajectoryResponse>> {
  try {
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
      return NextResponse.json({ trajectory: null }, { status: 401 });
    }

    const { data: trajectory } = await supabase
      .from("trajectories")
      .select("statement, born_project, created_at")
      .eq("user_id", userData.user.id)
      .is("superseded_at", null)
      .maybeSingle();

    return NextResponse.json({ trajectory: trajectory || null });
  } catch (error) {
    console.error("Trajectory current route error:", error);
    return NextResponse.json({ trajectory: null }, { status: 500 });
  }
}
