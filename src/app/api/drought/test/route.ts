import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  try {
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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Create 7 days of varied fake data
    const fakeData = [
      {
        raw_entry: "Woke up feeling a bit scattered. Mind is jumping between things. Starting the day quietly.",
        energy: "low" as const,
        inner_weather: "scattered",
        creative_readiness: false,
        arc_texture: "Breakaway" as const,
        check_in_type: "morning",
      },
      {
        raw_entry: "Work was productive but felt mechanical. Getting through tasks without much spark. Ready for a break.",
        energy: "medium" as const,
        inner_weather: "mechanical",
        creative_readiness: false,
        arc_texture: "Integration" as const,
        check_in_type: "after_work",
      },
      {
        raw_entry: "Evening brought a second wind. Feeling more present and curious about things. Getting into flow with a project.",
        energy: "high" as const,
        inner_weather: "alive",
        creative_readiness: true,
        arc_texture: "Expansion" as const,
        check_in_type: "evening",
      },
      {
        raw_entry: "Quiet morning. Reflective mood. Everything feels settled. Not much energy but feeling grounded.",
        energy: "low" as const,
        inner_weather: "grounded",
        creative_readiness: false,
        arc_texture: "Beginning" as const,
        check_in_type: "morning",
      },
      {
        raw_entry: "Middle of the afternoon. Restless energy. Lots of ideas but hard to focus on just one. Feeling pulled in directions.",
        energy: "high" as const,
        inner_weather: "restless",
        creative_readiness: true,
        arc_texture: "Breakaway" as const,
        check_in_type: "moment",
      },
      {
        raw_entry: "Day was steady. Moving through things with intention. Feeling balanced and capable. Creative ideas flowing.",
        energy: "medium" as const,
        inner_weather: "flowing",
        creative_readiness: true,
        arc_texture: "Expansion" as const,
        check_in_type: "evening",
      },
      {
        raw_entry: "Morning sitting with some heaviness. Not sure where it's coming from. Trying to be gentle with myself.",
        energy: "low" as const,
        inner_weather: "heavy",
        creative_readiness: false,
        arc_texture: "Integration" as const,
        check_in_type: "morning",
      },
    ];

    // Generate timestamps for last 7 days
    const today = new Date();
    const checkInsWithDates = fakeData.map((data, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - index));
      date.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60), 0, 0);

      return {
        user_id: userId,
        raw_entry: data.raw_entry,
        energy: data.energy,
        inner_weather: data.inner_weather,
        creative_readiness: data.creative_readiness,
        arc_texture: data.arc_texture,
        check_in_type: data.check_in_type,
        dream_content: null,
        created_at: date.toISOString(),
      };
    });

    // Insert into check_ins table
    const { data: insertedData, error: insertError } = await supabase
      .from("check_ins")
      .insert(checkInsWithDates)
      .select();

    if (insertError) {
      console.error("Error inserting test data:", insertError);
      return NextResponse.json(
        { error: "Failed to insert test data", details: insertError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "7 days of test check-ins created",
      count: insertedData?.length || 0,
    });
  } catch (error) {
    console.error("Test route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
