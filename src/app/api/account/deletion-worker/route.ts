import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const rl = await rateLimit(getRateLimitKey({ ip: getClientIp(request) }), "/api/account/deletion-worker", 10, 60);
  if (!rl.allowed) return rl.response!;
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });

  const { data: requests, error } = await (supabase as any)
    .from("account_deletion_requests")
    .select("id,user_id,status,scheduled_deletion_at")
    .in("status", ["pending", "failed"])
    .lte("scheduled_deletion_at", new Date().toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; status: string; error?: string }[] = [];
  for (const req of requests ?? []) {
    const { data: claimed, error: claimError } = await (supabase as any)
      .from("account_deletion_requests")
      .update({ status: "processing", processing_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", req.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimError || !claimed) {
      results.push({ id: req.id, status: "skipped", error: claimError?.message ?? "Already claimed" });
      continue;
    }

    try {
      for (const bucket of ["avatars", "banners", "media", "media_private", "afterfur-media", "account_exports"]) {
        const { data: files } = await (supabase as any).storage.from(bucket).list(req.user_id, { limit: 1000 });
        if (files?.length) {
          const paths = files.map((f: { name: string }) => `${req.user_id}/${f.name}`);
          await (supabase as any).storage.from(bucket).remove(paths);
        }
      }

      await (supabase as any).from("posts").delete().eq("author_id", req.user_id);
      await (supabase as any).from("replies").delete().eq("author_id", req.user_id);
      await (supabase as any).from("bookmarks").delete().eq("user_id", req.user_id);
      await (supabase as any).from("bookmark_folders").delete().eq("user_id", req.user_id);
      await (supabase as any).from("notifications").delete().eq("user_id", req.user_id);
      await (supabase as any).from("profiles").delete().eq("id", req.user_id);

      await supabase.auth.admin.deleteUser(req.user_id);

      await (supabase as any)
        .from("account_deletion_requests")
        .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", req.id);
      results.push({ id: req.id, status: "completed" });
    } catch (e) {
      await (supabase as any)
        .from("account_deletion_requests")
        .update({ status: "failed", failure_reason: e instanceof Error ? e.message : "Unknown error", updated_at: new Date().toISOString() })
        .eq("id", req.id);
      results.push({ id: req.id, status: "failed", error: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
