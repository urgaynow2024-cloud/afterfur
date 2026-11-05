import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const body = await request.json();
    const action = body.action;

    const { data: req } = await supabase.from("message_requests").select("*").eq("id", id).maybeSingle();
    if (!req) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if ((req as any).to_user_id !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });

    if (action === "reject") {
      await (supabase as any).from("message_requests").update({ status: "rejected" }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    if (action === "accept") {
      await (supabase as any).from("message_requests").update({ status: "accepted" }).eq("id", id);
      const { data: conversationId } = await (supabase as any).rpc("create_direct_conversation", { p_recipient_id: (req as any).from_user_id });
      return NextResponse.json({ ok: true, conversationId });
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
