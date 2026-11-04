import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getPostForViewer } from "@/lib/posts.server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    let viewerId: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      viewerId = data.user?.id ?? null;
    }

    const result = await getPostForViewer({ postId: id, viewerId });
    if (result.error === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!result.post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ post: result.post });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
