import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getProfileForViewer } from "@/lib/profiles.server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const supabase = createServerClient();
    let viewerId: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      viewerId = data.user?.id ?? null;
    }

    const result = await getProfileForViewer({ username, viewerId });
    if (result.error === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!result.profile) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ profile: result.profile });
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
