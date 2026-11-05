import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const body = await request.json();
    const recipientId = body.recipientId;
    if (!recipientId) return NextResponse.json({ error: "invalid" }, { status: 400 });
    if (recipientId === userId) return NextResponse.json({ error: "invalid" }, { status: 400 });

    const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", userId).eq("blocked_id", recipientId).limit(1);
    if ((b1||[]).length) return NextResponse.json({ error: "blocked" }, { status: 403 });
    const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", recipientId).eq("blocked_id", userId).limit(1);
    if ((b2||[]).length) return NextResponse.json({ error: "blocked" }, { status: 403 });

    const { data: conversationId, error } = await supabase.rpc("create_direct_conversation", { p_recipient_id: recipientId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ conversationId });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
