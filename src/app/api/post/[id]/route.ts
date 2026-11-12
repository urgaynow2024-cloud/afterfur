import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { getPostForViewer } from "@/lib/posts.server";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const user = await getVerifiedUser(request);
    const viewerId = user?.id ?? null;
    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/post/[id]", 120, 60);
    if (!rl.allowed) return rl.response!;

    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const result = await getPostForViewer({ postId: id, viewerId });
    if (result.error === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    if (!result.post) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ post: result.post });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
