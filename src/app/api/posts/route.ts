import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const viewerId = userData.user.id;

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content : "";
    const media_urls = Array.isArray(body.media_urls) ? body.media_urls : [];
    if (content.trim().length === 0 && media_urls.length === 0) {
      return NextResponse.json({ error: "empty" }, { status: 400 });
    }
    if (content.length > 600) {
      return NextResponse.json({ error: "too_long" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({ author_id: viewerId, content: content.trim(), media_urls })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ post: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
