import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;

    const { data: memberships } = await supabase.from("conversation_participants").select("conversation_id,user_id").eq("user_id", userId);
    const conversationIds = [...new Set(((memberships||[]) as any[]).map(r=>r.conversation_id))];
    if (!conversationIds.length) return NextResponse.json({ conversations: [] });

    const { data: memberRows } = await supabase.from("conversation_participants").select("conversation_id,user_id").in("conversation_id", conversationIds);
    const peers = new Map<string,string>();
    (memberRows||[]).forEach((m:any)=>{ if(m.user_id!==userId) peers.set(m.conversation_id,m.user_id); });
    const peerIds = [...new Set(Array.from(peers.values()))];
    const [{ data: profiles }, { data: recent }] = await Promise.all([
      peerIds.length ? supabase.from("profiles").select("id,username,display_name,avatar_url").in("id",peerIds) : Promise.resolve({ data: [] }),
      supabase.rpc("get_latest_conversation_messages", { p_conversation_ids: conversationIds }),
    ]);
    const pmap = new Map((profiles||[]).map((p:any)=>[p.id,p]));
    const last = new Map();
    (recent||[]).forEach((r:any)=>{ if(r.conversation_id && !last.has(r.conversation_id)) last.set(r.conversation_id,r); });
    const conversations = conversationIds.map((id)=>({ id, peer: peers.get(id)?pmap.get(peers.get(id)):null, lastMessage: last.get(id)||null }));
    return NextResponse.json({ conversations });
  } catch {
    return NextResponse.json({ conversations: [] });
  }
}
