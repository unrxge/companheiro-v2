import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ConfirmRequest {
  observation: string;
  pattern_type: "energy" | "arc" | "creative";
  confirmed_by_user: boolean;
  user_response?: string;
  action_taken: "none" | "board_adjusted" | "library_suggested";
}

interface ConfirmResponse {
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<ConfirmResponse>> {
  try {
    const body: ConfirmRequest = await request.json();

    // Validate required fields
    if (!body.observation || !body.pattern_type || body.confirmed_by_user === undefined || !body.action_taken) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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

    // Insert into drought_observations table
    const { error: insertError } = await supabase.from("drought_observations").insert([
      {
        user_id: userId,
        observation: body.observation,
        pattern_type: body.pattern_type,
        confirmed_by_user: body.confirmed_by_user,
        user_response: body.user_response || null,
        action_taken: body.action_taken,
      },
    ]);

    if (insertError) {
      console.error("Error inserting observation:", insertError);
      return NextResponse.json(
        { success: false, error: "Failed to save observation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Drought confirm error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
