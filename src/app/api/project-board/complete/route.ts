import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CompleteRequest {
  piece_id: string;
}

interface CompleteResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<CompleteResponse>> {
  try {
    const body: CompleteRequest = await request.json();

    if (!body.piece_id) {
      return NextResponse.json(
        { success: false, error: "Missing piece_id" },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("pieces")
      .update({
        stage: "posted",
        posted_at: now,
      })
      .eq("id", body.piece_id)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error completing piece:", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to complete piece" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Complete piece error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
