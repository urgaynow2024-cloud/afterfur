import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const { data: userData } = await supabase.auth.getUser();
    const viewerId = userData.user?.id ?? null;
    const meta = (userData.user as any)?.app_metadata ?? {};
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
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

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
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

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
    if (!content || content.length > 600) {
      return NextResponse.json({ error: "invalid_content" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("posts")
      .update({ content, edited_at: new Date().toISOString() })
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
