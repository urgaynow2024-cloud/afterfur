import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "12");
    const offset = Number(searchParams.get("offset") || "0");

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ posts: [] });
    }
    let viewerId: string | null = null;
    const { data: userData } = await (supabase as any).auth.getUser();
    viewerId = userData.user?.id ?? null;
    const meta = (userData.user as any)?.app_metadata ?? {};
    let staff = meta.afterfur_staff_admin === true || meta.afterfur_staff_admin === "true";
    if (!staff && viewerId) {
      const { data: role } = await (supabase as any).from("moderator_roles").select("role").eq("user_id", viewerId).maybeSingle();
      staff = Boolean((role as any)?.role);
    }

    let q = (supabase as any)
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + limit - 1);
    if (!staff) q = q.or("moderation_status.is.null,moderation_status.eq.visible");
    const { data: postRows } = await q;

    const posts = postRows || [];
    const authorIds = [...new Set((posts as any[]).map((p: any) => p.author_id).filter(Boolean))];
    const { data: profiles } = authorIds.length
      ? await (supabase as any).from("profiles").select("id,username,display_name,avatar_url,is_private").in("id", authorIds)
      : { data: [] };
    const profMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    let followMap = new Map();
    let blockedSet = new Set<string>();
    if (viewerId) {
      const [follows, blocks] = await Promise.all([
        (supabase as any).from("follows").select("following_id,status").eq("follower_id", viewerId),
        (supabase as any).from("blocks").select("blocked_id").eq("blocker_id", viewerId),
      ]);
      (follows.data || []).forEach((f: any) => { if (f.following_id) followMap.set(f.following_id, f.status); });
      (blocks.data || []).forEach((b: any) => { if (b.blocked_id) blockedSet.add(b.blocked_id); });
    }

    const { canShowPostInFeed } = await import("@/lib/feedPrivacy");
    const filtered = (posts as any[])
      .filter((p: any) => {
        if (blockedSet.has(p.author_id)) return false;
        const prof = profMap.get(p.author_id);
        return canShowPostInFeed(p, prof as any, { viewerId, followMap, blockedSet });
      })
      .map((p: any) => ({ ...p, profiles: profMap.get(p.author_id) || null }));

    return NextResponse.json({ posts: filtered });
  } catch {
    return NextResponse.json({ posts: [] }, { status: 200 });
  }
}
