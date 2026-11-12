import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { getPostForViewer } from "@/lib/posts.server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const user = await getVerifiedUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/posts/[id]/repost", 30, 60);
    if (!rl.allowed) return rl.response;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const viewerId = user.id;

    const check = await getPostForViewer({ postId, viewerId });
    if (check.error === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!check.post) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { data: existing } = await supabase
      .from("reposts")
      .select("post_id")
      .eq("user_id", viewerId)
      .eq("post_id", postId)
      .maybeSingle();
    if (existing) return NextResponse.json({ error: "exists" }, { status: 409 });

    const { data, error } = await supabase
      .from("reposts")
      .insert({ user_id: viewerId, post_id: postId })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ repost: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const user = await getVerifiedUser(request);
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/posts/[id]/repost", 30, 60);
    if (!rl.allowed) return rl.response;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const viewerId = user.id;

    const { data, error } = await supabase
      .from("reposts")
      .delete()
      .eq("user_id", viewerId)
      .eq("post_id", postId)
      .select("*")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}