import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import * as postsServer from "@/lib/posts.server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || "40");
    const cursorCreatedAt = searchParams.get("cursorCreatedAt");
    const cursorId = searchParams.get("cursorId");
    const cursor = cursorCreatedAt && cursorId ? { created_at: cursorCreatedAt, id: cursorId } : null;

    const supabase = createServerClient();
    let viewerId: string | null = null;
    if (supabase) {
      const { data } = await (supabase as any).auth.getUser();
      viewerId = data.user?.id ?? null;
    }

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
