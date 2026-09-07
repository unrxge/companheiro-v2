import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route";

export async function GET() {
  try {
    const auth = await requireUser();
    if (!auth) return NextResponse.json({ lockedUntil: null }, { status: 401 });
    const { supabase, user } = auth;

    const { data } = await supabase
      .from("user_settings")
      .select("assistant_write_locked_until")
      .eq("user_id", user.id)
      .maybeSingle();

    const lockedUntil = data?.assistant_write_locked_until ?? null;
    const active = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();
    return NextResponse.json({ lockedUntil: active ? lockedUntil : null });
  } catch (error) {
    console.error("assistant-lock GET error:", error);
    return NextResponse.json({ lockedUntil: null }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser();
    if (!auth) return NextResponse.json({ success: false }, { status: 401 });
    const { supabase, user } = auth;

    const body: { minutes?: number } = await request.json();
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return NextResponse.json({ success: false, error: "Invalid duration" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("user_settings")
      .select("assistant_write_locked_until")
      .eq("user_id", user.id)
      .maybeSingle();

    const now = Date.now();
    const currentLock = existing?.assistant_write_locked_until
      ? new Date(existing.assistant_write_locked_until).getTime()
      : 0;
    const proposed = now + minutes * 60_000;

    // Extend-only: an active lock can never be shortened or cleared through
    // this endpoint — that restriction is the entire point of the feature.
    if (currentLock > now && proposed <= currentLock) {
      return NextResponse.json({ success: false, error: "An active lock cannot be shortened" }, { status: 409 });
    }

    const lockedUntil = new Date(proposed).toISOString();
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        { user_id: user.id, assistant_write_locked_until: lockedUntil, updated_at: new Date().toISOString() },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("assistant-lock upsert error:", error);
      return NextResponse.json({ success: false }, { status: 500 });
    }
    return NextResponse.json({ success: true, lockedUntil });
  } catch (error) {
    console.error("assistant-lock POST error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
