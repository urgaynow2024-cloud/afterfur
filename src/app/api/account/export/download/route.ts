import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createHash } from "crypto";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");
  if (!rawToken) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const service = createServerClient();
  if (!service) return NextResponse.json({ error: "Service client not configured" }, { status: 500 });

  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const { data: req, error } = await (service as any)
    .from("data_export_requests")
    .select("id,user_id,status,download_expires_at,download_count")
    .eq("download_token_hash", tokenHash)
    .maybeSingle();

  if (error || !req) return NextResponse.json({ error: "Invalid token" }, { status: 404 });
  if (req.status !== "completed") return NextResponse.json({ error: "Export not ready" }, { status: 409 });
  if (req.download_count > 0) return NextResponse.json({ error: "Token already used" }, { status: 410 });
  if (req.download_expires_at && new Date(req.download_expires_at).getTime() < Date.now()) return NextResponse.json({ error: "Token expired" }, { status: 410 });

  // Atomically increment download_count
  const { data: updated, error: updateError } = await (service as any)
    .from("data_export_requests")
    .update({ download_count: req.download_count + 1 })
    .eq("id", req.id)
    .eq("download_count", req.download_count)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) return NextResponse.json({ error: "Token already used" }, { status: 410 });

  const path = `${req.user_id}/${req.id}.json`;
  const { data: file, error: downloadError } = await service.storage.from("account_exports").download(path);
  if (downloadError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  return new NextResponse(file, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="afterfur-export-${req.id}.json"`,
    },
  });
}
