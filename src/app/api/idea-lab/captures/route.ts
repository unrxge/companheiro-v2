import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface Capture {
  id: string;
  raw_input: string;
  unpacked: string;
  arc: string;
  thematic_territory: string;
  created_at: string;
}

interface CapturesResponse {
  captures: Capture[];
}

export async function GET(_request: NextRequest): Promise<NextResponse<CapturesResponse>> {
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
      return NextResponse.json({ captures: [] }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: captures, error: queryError } = await supabase
      .from("captures")
      .select("id, raw_input, unpacked, arc, thematic_territory, url, created_at")
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
