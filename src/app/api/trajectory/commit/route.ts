import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface CommitRequest {
  statement: string;
  born_project?: string;
}

interface CommitResponse {
  success: boolean;
}

export async function POST(request: NextRequest): Promise<NextResponse<CommitResponse>> {
  try {
    const body: CommitRequest = await request.json();

    if (!body.statement?.trim()) {
      return NextResponse.json({ success: false }, { status: 400 });
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
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const { error: rpcError } = await supabase.rpc("commit_trajectory", {
      p_statement: body.statement.trim(),
      p_born_project: body.born_project?.trim() || null,
    });

    if (rpcError) {
      console.error("commit_trajectory RPC error:", rpcError);
      return NextResponse.json({ success: false }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Trajectory commit route error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
