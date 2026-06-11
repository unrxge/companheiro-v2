import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface DeleteRequest {
  task_id: string;
}

interface PostRequest {
  piece_id: string;
  title: string;
  type: "creation" | "execution";
}

interface UpdateRequest {
  task_id: string;
  status: "pending" | "complete";
}

interface TaskResponse {
  success: boolean;
  error?: string;
}

export async function DELETE(request: NextRequest): Promise<NextResponse<TaskResponse>> {
  try {
    const body: DeleteRequest = await request.json();

    if (!body.task_id) {
      return NextResponse.json({ success: false, error: "Missing task_id" }, { status: 400 });
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
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error: deleteError } = await supabase
      .from("tasks")
      .delete()
      .eq("id", body.task_id)
      .eq("user_id", userData.user.id);

    if (deleteError) {
      console.error("Error deleting task:", deleteError);
      return NextResponse.json({ success: false, error: "Failed to delete task" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete task error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<TaskResponse>> {
  try {
    const body: PostRequest = await request.json();

    if (!body.piece_id || !body.title || !body.type) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = userData.user.id;

    // Get the max order for this piece
    const { data: maxOrderData } = await supabase
      .from("tasks")
      .select("order")
      .eq("piece_id", body.piece_id)
      .order("order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrderData?.order || -1) + 1;

    const { error: insertError } = await supabase.from("tasks").insert([
      {
        user_id: userId,
        piece_id: body.piece_id,
        title: body.title,
        type: body.type,
        order: nextOrder,
        status: "pending",
      },
    ]);

    if (insertError) {
      console.error("Error inserting task:", insertError);
      return NextResponse.json({ success: false, error: "Failed to add task" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add task error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse<TaskResponse>> {
  try {
    const body: UpdateRequest = await request.json();

    if (!body.task_id || !body.status) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
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
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await supabase
      .from("tasks")
      .update({ status: body.status })
      .eq("id", body.task_id)
      .eq("user_id", userData.user.id);

    if (updateError) {
      console.error("Error updating task:", updateError);
      return NextResponse.json({ success: false, error: "Failed to update task" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update task error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
