/**
 * GET /api/moderation/audit-log
 *   Returns moderation audit log entries with optional filtering by actor,
 *   target type, action and date range. Paginated.
 *   Requires moderator role or above.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/audit-log", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const actorId = url.searchParams.get("actor_id") || undefined;
    const targetType = url.searchParams.get("target_type") || undefined;
    const action = url.searchParams.get("action") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from("moderation_audit_log")
      .select(
        "id, actor_id, target_type, target_id, action, details, before_state, after_state, created_at, profiles!moderation_audit_log_actor_id_fkey(username, display_name)",
      )
      .order("created_at", { ascending: false });

    if (actorId) q = q.eq("actor_id", actorId);
    if (targetType) q = q.eq("target_type", targetType);
    if (action) q = q.ilike("action", `%${action}%`);

    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const entries = ((data ?? []) as any[]).map((row) => {
      const actorProfile = row.profiles;
      return {
        id: row.id,
        actorId: row.actor_id,
        actorUsername: actorProfile?.username ?? null,
        actorDisplayName: actorProfile?.display_name ?? null,
        targetType: row.target_type,
        targetId: row.target_id,
        action: row.action,
        details: row.details ?? null,
        beforeState: row.before_state ?? null,
        afterState: row.after_state ?? null,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ entries, page, pageSize, total: count ?? 0 });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
