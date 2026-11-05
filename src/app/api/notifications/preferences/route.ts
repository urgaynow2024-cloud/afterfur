import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const { data } = await (supabase as any).from("notification_preferences").select("*").eq("user_id", userId).maybeSingle();
    const prefs = {
      likes: data?.likes ?? true,
      replies: data?.replies ?? true,
      reposts: data?.reposts ?? true,
      follows: data?.follows ?? true,
      follow_requests: data?.follow_requests ?? true,
      mentions: data?.mentions ?? true,
    };
    return NextResponse.json({ prefs });
  } catch {
    return NextResponse.json({ prefs: { likes: true, replies: true, reposts: true, follows: true, follow_requests: true, mentions: true } });
  }
}

export async function PUT(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const body = await request.json();
    const prefs = {
      user_id: userId,
      likes: !!body.likes,
      replies: !!body.replies,
      reposts: !!body.reposts,
      follows: !!body.follows,
      follow_requests: !!body.follow_requests,
      mentions: !!body.mentions,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any).from("notification_preferences").upsert(prefs, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
