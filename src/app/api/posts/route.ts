import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function POST(request: Request) {
  try {
    const user = await getVerifiedUser(request);
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = user.id;

    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/posts", 10, 60);
    if (!rl.allowed) return rl.response;

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content : "";
    const media_urls = Array.isArray(body.media_urls) ? body.media_urls : [];
    const classification =
      typeof body.classification === "string" && body.classification.length > 0
        ? body.classification
        : "SFW";
    if (classification !== "SFW" && classification !== "NSFW") {
      return NextResponse.json({ error: "invalid_classification" }, { status: 400 });
    }
    if (content.trim().length === 0 && media_urls.length === 0) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    if (content.length > 600) {
      return NextResponse.json({ error: "too_long" }, { status: 400 });
    }

    // Ad-section (NSFW) posts require the official Ad badge (ad_creator).
    // The badge is the source of truth: no secondary approval or eligibility
    // flag is needed once the badge is present. Badge removal immediately
    // removes this permission because the check runs on every request.
    if (classification === "NSFW") {
      const { data: hasBadge, error: badgeError } = await supabase.rpc("has_ad_badge", {
        p_user_id: viewerId,
      });
      if (badgeError || !hasBadge) {
        return NextResponse.json(
          { error: "ad_badge_required", message: "The Ad badge is required to post in the Ad section." },
          { status: 403 },
        );
      }
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({ author_id: viewerId, content: content.trim(), media_urls, classification })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    try {
      const { createMentionNotifications } = await import("@/lib/mentions.server");
      await createMentionNotifications({ authorId: viewerId, postId: (data as any).id, content: content.trim() });
    } catch {}
    return NextResponse.json({ post: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
