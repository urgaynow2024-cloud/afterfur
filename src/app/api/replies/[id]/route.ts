import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: replyId } = await params;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

    const { data: reply } = await supabase
      .from("replies")
      .select("id,author_id")
      .eq("id", replyId)
      .maybeSingle();
    if (!reply) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if ((reply as any).author_id !== viewerId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { error } = await supabase.from("replies").delete().eq("id", replyId).eq("author_id", viewerId);
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
    const { id: replyId } = await params;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

    const { data: reply } = await supabase
      .from("replies")
      .select("id,author_id")
      .eq("id", replyId)
      .maybeSingle();
    if (!reply) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if ((reply as any).author_id !== viewerId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content || content.length > 300) {
      return NextResponse.json({ error: "invalid_content" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("replies")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", replyId)
      .eq("author_id", viewerId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ reply: data });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
