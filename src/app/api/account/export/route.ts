import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "crypto";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = userData.user.id;
  const service = createServerClient();
  if (!service) return NextResponse.json({ error: "Service client not configured" }, { status: 500 });

  const { data: requestId, error: rpcError } = await (service as any).rpc("request_data_export");
  if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 500 });

  try {
    const [profile, posts, replies, bookmarks, folders, customisation] = await Promise.all([
      (service as any).from("profiles").select("*").eq("id", userId).maybeSingle(),
      (service as any).from("posts").select("*").eq("author_id", userId),
      (service as any).from("replies").select("*").eq("author_id", userId),
      (service as any).from("bookmarks").select("*").eq("user_id", userId),
      (service as any).from("bookmark_folders").select("*").eq("user_id", userId),
      (service as any).from("profiles").select("profile_customisation").eq("id", userId).maybeSingle(),
    ]);

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: profile.data ?? null,
      posts: posts.data ?? [],
      replies: replies.data ?? [],
      bookmarks: bookmarks.data ?? [],
      bookmarkFolders: folders.data ?? [],
      customisation: customisation.data?.profile_customisation ?? null,
    };

    const json = JSON.stringify(exportPayload, null, 2);
    const path = `${userId}/${requestId}.json`;
    const { error: uploadError } = await service.storage.from("account_exports").upload(path, new Blob([json], { type: "application/json" }), { upsert: true });
    if (uploadError) throw uploadError;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await (service as any)
      .from("data_export_requests")
      .update({ status: "completed", completed_at: new Date().toISOString(), download_token_hash: tokenHash, download_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), download_count: 0 })
      .eq("id", requestId);

    const origin = new URL(request.url).origin;
    const downloadUrl = `${origin}/api/account/export/download?token=${rawToken}`;
    return NextResponse.json({ requestId, downloadUrl, expiresIn: 3600 });
  } catch (e) {
    await (service as any).from("data_export_requests").update({ status: "failed", failure_reason: e instanceof Error ? e.message : "Unknown error" }).eq("id", requestId);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
