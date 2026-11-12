import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import * as postsServer from "@/lib/posts.server";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "40");
    const cursorCreatedAt = searchParams.get("cursorCreatedAt");
    const cursorId = searchParams.get("cursorId");
    const cursor = cursorCreatedAt && cursorId ? { created_at: cursorCreatedAt, id: cursorId } : null;

    const user = await getVerifiedUser(request);
    const viewerId = user?.id ?? null;
    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/feed/home", 120, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    const fn = (postsServer as any).getFeedPostsForViewer;
    if (typeof fn !== "function") {
      return NextResponse.json({ posts: [] });
    }
    const result = await fn({ viewerId, limit, cursor });
    return NextResponse.json({ posts: (result as any).posts || [] });
  } catch {
    return NextResponse.json({ posts: [] }, { status: 200 });
  }
}
