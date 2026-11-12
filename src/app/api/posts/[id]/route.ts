import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const user = await getVerifiedUser(request);
    const viewerId = user?.id ?? null;
    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/posts/[id]", 120, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const meta = (user as any)?.app_metadata ?? {};
    let staff = meta.afterfur_staff_admin === true || meta.afterfur_staff_admin === "true";
    if (!staff && viewerId) {
      const { data: role } = await supabase.from("moderator_roles").select("role").eq("user_id", viewerId).maybeSingle();
      staff = Boolean((role as any)?.role);
    }

    const { data: post, error } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
    if (error || !post) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!staff && ((post as any).moderation_status ?? "visible") === "removed") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ post });
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
    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/posts/[id]", 20, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = user.id;

    const { data: post } = await supabase
      .from("posts")
      .select("id,author_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if ((post as any).author_id !== viewerId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("posts").delete().eq("id", postId).eq("author_id", viewerId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const user = await getVerifiedUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const rl = await rateLimit(getRateLimitKey({ userId: user.id, ip: getClientIp(request) }), "/api/posts/[id]", 20, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = user.id;

    const { data: post } = await supabase
      .from("posts")
      .select("id,author_id")
      .eq("id", postId)
      .maybeSingle();
    if (!post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if ((post as any).author_id !== viewerId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const classification = typeof body.classification === "string" ? body.classification : undefined;
    if (!content || content.length > 600) {
      return NextResponse.json({ error: "invalid_content" }, { status: 400 });
    }
    if (classification !== undefined && classification !== "SFW" && classification !== "NSFW") {
      return NextResponse.json({ error: "invalid_classification" }, { status: 400 });
    }

    const updateFields: Record<string, unknown> = { content, edited_at: new Date().toISOString() };
    if (classification !== undefined) updateFields.classification = classification;

    // Changing to NSFW requires the ad_creator badge. Badge removal revokes
    // this permission immediately because the check runs on every request.
    if (classification === "NSFW") {
      const { data: hasBadge, error: badgeError } = await supabase.rpc("has_ad_badge", {
        p_user_id: viewerId,
      });
      if (badgeError || !hasBadge) {
        return NextResponse.json(
          { error: "ad_badge_required", message: "The Ad badge is required to post NSFW content." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("posts")
      .update(updateFields)
      .eq("id", postId)
      .eq("author_id", viewerId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}