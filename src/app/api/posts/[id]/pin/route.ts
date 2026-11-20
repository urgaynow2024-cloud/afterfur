import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

type PinnedPost = {
  id: string;
  is_pinned: boolean;
  pinned_at: string | null;
};

async function requireOwner(supabase: SupabaseClient, postId: string, viewerId: string) {
  const { data: post } = await supabase
    .from("posts")
    .select("id,author_id")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { post: null, notFound: true };
  if ((post as any).author_id !== viewerId) return { post: null, forbidden: true };
  return { post, notFound: false, forbidden: false };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const user = await getVerifiedUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = user.id;

    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/posts/[id]/pin", 20, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const check = await requireOwner(supabase, postId, viewerId);
    if (check.notFound) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (check.forbidden) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // One pinned post per author: clear any existing pin for this author first,
    // then pin the requested post. The partial unique index on
    // (author_id) WHERE is_pinned = true also enforces this at the database
    // level, but clearing first avoids a race and keeps a single pinned post.
    await supabase
      .from("posts")
      .update({ is_pinned: false, pinned_at: null })
      .eq("author_id", viewerId)
      .eq("is_pinned", true);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("posts")
      .update({ is_pinned: true, pinned_at: now })
      .eq("id", postId)
      .eq("author_id", viewerId)
      .select("id,is_pinned,pinned_at")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "could not pin post" }, { status: 400 });
    }
    return NextResponse.json({ post: data as PinnedPost }, { status: 200 });
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
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = user.id;

    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/posts/[id]/pin", 20, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const check = await requireOwner(supabase, postId, viewerId);
    if (check.notFound) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (check.forbidden) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("posts")
      .update({ is_pinned: false, pinned_at: null })
      .eq("id", postId)
      .eq("author_id", viewerId)
      .eq("is_pinned", true);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
