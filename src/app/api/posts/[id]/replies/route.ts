import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getPostForViewer } from "@/lib/posts.server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

    const postCheck = await getPostForViewer({ postId, viewerId });
    if (postCheck.error === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!postCheck.post) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    const parent_reply_id = typeof body.parent_reply_id === "string" && body.parent_reply_id ? body.parent_reply_id : null;
    if (!content || content.length > 300) {
      return NextResponse.json({ error: "invalid_content" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("replies")
      .insert({ post_id: postId, author_id: viewerId, content, parent_reply_id })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    try {
      const { createMentionNotifications } = await import("@/lib/mentions.server");
      await createMentionNotifications({ authorId: viewerId, postId, replyId: (data as any).id, content });
    } catch {}
    return NextResponse.json({ reply: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
