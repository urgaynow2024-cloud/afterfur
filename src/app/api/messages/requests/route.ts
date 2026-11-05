import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;

    const { data: incoming } = await supabase
      .from("message_requests")
      .select("id,from_user_id,to_user_id,status,created_at")
      .eq("to_user_id", userId)
      .eq("status", "pending");
    const { data: outgoing } = await supabase
      .from("message_requests")
      .select("id,from_user_id,to_user_id,status,created_at")
      .eq("from_user_id", userId);

    const userIds = [...new Set([...(incoming||[]).map((r:any)=>r.from_user_id), ...(outgoing||[]).map((r:any)=>r.to_user_id)])];
    const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,username,display_name,avatar_url").in("id", userIds) : { data: [] };
    const pmap = new Map((profiles||[]).map((p:any)=>[p.id,p]));

    return NextResponse.json({
      incoming: (incoming||[]).map((r:any)=>({...r, profile: pmap.get(r.from_user_id)})),
      outgoing: (outgoing||[]).map((r:any)=>({...r, profile: pmap.get(r.to_user_id)})),
    });
  } catch {
    return NextResponse.json({ incoming: [], outgoing: [] });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const body = await request.json();
    const toUserId = body.toUserId;
    if (!toUserId || toUserId === userId) return NextResponse.json({ error: "invalid" }, { status: 400 });

    const { data: b1 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", userId).eq("blocked_id", toUserId).limit(1);
    if ((b1||[]).length) return NextResponse.json({ error: "blocked" }, { status: 403 });
    const { data: b2 } = await supabase.from("blocks").select("blocker_id").eq("blocker_id", toUserId).eq("blocked_id", userId).limit(1);
    if ((b2||[]).length) return NextResponse.json({ error: "blocked" }, { status: 403 });

    const { data: existing } = await supabase.from("message_requests").select("id,status").or(`and(from_user_id.eq.${userId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${userId})`).limit(1);
    if ((existing||[]).length) return NextResponse.json({ error: "exists" }, { status: 409 });

    const { data, error } = await (supabase as any).from("message_requests").insert({ from_user_id: userId, to_user_id: toUserId, status: "pending" }).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ request: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
