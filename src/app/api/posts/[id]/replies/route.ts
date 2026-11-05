import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getPostForViewer } from "@/lib/posts.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = userData.user.id;
    const { post, error: postError } = await getPostForViewer({ postId, viewerId: userId });
    if (postError || !post) return NextResponse.json({ error: postError === "forbidden" ? "forbidden" : "not_found" }, { status: postError === "forbidden" ? 403 : 404 });
    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) return NextResponse.json({ error: "empty" }, { status: 400 });
    if (content.length > 600) return NextResponse.json({ error: "too_long" }, { status: 400 });
    const { data, error } = await supabase.from("replies").insert({ post_id: postId, author_id: userId, content } as any).select("*").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ reply: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ replies: [] });
    const { data: userData } = await supabase.auth.getUser();
    const viewerId = userData.user?.id ?? null;
    const meta = (userData.user as any)?.app_metadata ?? {};
    let staff = meta.afterfur_staff_admin === true || meta.afterfur_staff_admin === "true";
    if (!staff && viewerId) {
      const { data: role } = await supabase.from("moderator_roles").select("role").eq("user_id", viewerId).maybeSingle();
      staff = Boolean((role as any)?.role);
    }
    const { post, error: postError } = await getPostForViewer({ postId, viewerId });
    if (postError || !post) return NextResponse.json({ replies: [], error: postError === "forbidden" ? "forbidden" : "not_found" }, { status: postError === "forbidden" ? 403 : 404 });
    let q = supabase.from("replies").select("*").eq("post_id", postId).order("created_at", { ascending: true });
    if (!staff) q = (q as any).or("moderation_status.is.null,moderation_status.eq.visible");
    const { data, error } = await q;
    if (error) return NextResponse.json({ replies: [] });
    return NextResponse.json({ replies: data ?? [] });
  } catch {
    return NextResponse.json({ replies: [] }, { status: 200 });
  }
}
