/**
 * GET /api/moderation/dashboard-stats
 *   Returns moderation dashboard statistics.
 *   Requires moderator role or above.
 *
 * Security/UX notes:
 * - Never exposes raw database errors, connection details, or credentials.
 * - If required moderation migrations are unapplied (missing tables/relations),
 *   returns a safe 503 with code "migration_required" and an admin-facing setup
 *   message. It does NOT return fake/zeroed statistics as a successful load.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

type SupabaseLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

const MIGRATION_REQUIRED_MESSAGE =
  "Moderator database setup is incomplete. Apply migrations 0033_moderator_administration.sql and 0034_moderation_content_status.sql (and any pending moderation migrations) to the target database, then reload this page. Migrations must not be applied to production automatically.";

function isMissingRelationError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
  // Inspect safe metadata only for migration detection; never expose raw backend details.
  const hay = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    hay.includes("does not exist") &&
    (hay.includes("relation") || hay.includes("table") || hay.includes("schema cache") || hay.includes("column"))
  ) || hay.includes("could not find the table");
}

function dbFailureResponse(error: SupabaseLikeError, context: string) {
  if (isMissingRelationError(error)) {
    return NextResponse.json(
      {
        error: "migration_required",
        code: "migration_required",
        message: MIGRATION_REQUIRED_MESSAGE,
        missing: context,
      },
      { status: 503 }
    );
  }
  return NextResponse.json(
    { error: "dashboard_stats_unavailable", message: "Failed to load dashboard statistics." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/dashboard-stats", 120, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const windowStart = dateFrom ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: reportsByStatus, error: reportsError } = await supabase.from("reports").select("status");
    if (reportsError) return dbFailureResponse(reportsError, "reports");

    const statusCounts = (reportsByStatus ?? []).reduce((acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    const dismissedCount = (statusCounts.dismissed || 0) + (statusCounts.actioned || 0);

    const recentReportsRes = await supabase
      .from("reports")
      .select("id, target_type, reason, status, created_at")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentReportsRes.error) return dbFailureResponse(recentReportsRes.error, "reports");

    const enforcementsRes = await supabase
      .from("user_enforcements")
      .select("id, user_id, type, reason, created_at")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(10);
    if (enforcementsRes.error) return dbFailureResponse(enforcementsRes.error, "user_enforcements");

    const { data: enforcementProfiles, error: enforcementProfileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .in(
        "user_id",
        [...new Set(((enforcementsRes.data ?? []) as any[]).map((r) => r.user_id).filter(Boolean))],
      );
    if (enforcementProfileError) return dbFailureResponse(enforcementProfileError, "profiles");
    const enforcementProfileMap = new Map(((enforcementProfiles ?? []) as any[]).map((p) => [p.id, p]));

    const appealsRes = await supabase
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (appealsRes.error) return dbFailureResponse(appealsRes.error, "appeals");

    // Active moderation staff count (real moderator_roles records).
    const { data: staffRoles, error: staffError } = await supabase
      .from("moderator_roles")
      .select("id", { count: "exact", head: true });
    if (staffError) return dbFailureResponse(staffError, "moderator_roles");

    // Recent moderation activity from the immutable audit log.
    const { data: recentActivityRows, error: activityError } = await supabase
      .from("moderation_audit_log")
      .select(
        "id, actor_id, target_type, target_id, action, created_at, profiles!moderation_audit_log_actor_id_fkey(username, display_name)",
      )
      .gte("created_at", windowStart)
      .order("created_at", { ascending: false })
      .limit(15);
    if (activityError) return dbFailureResponse(activityError, "moderation_audit_log");

    const recentActivity = ((recentActivityRows ?? []) as any[]).map((row) => {
      const actor = row.profiles;
      return {
        id: row.id,
        actorId: row.actor_id,
        actorUsername: actor?.username ?? null,
        actorDisplayName: actor?.display_name ?? null,
        targetType: row.target_type,
        targetId: row.target_id,
        action: row.action,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({
      ok: true,
      pendingReports: statusCounts.pending || 0,
      underReviewReports: statusCounts.reviewed || 0,
      resolvedReports: dismissedCount,
      dismissedReports: statusCounts.dismissed || 0,
      actionedReports: statusCounts.actioned || 0,
      totalReports: (reportsByStatus ?? []).length,
      recentReports: recentReportsRes.data ?? [],
      recentEnforcements: ((enforcementsRes.data ?? []) as any[]).map((e) => ({
        ...e,
        actorUsername: enforcementProfileMap.get(e.user_id)?.username ?? null,
        actorDisplayName: enforcementProfileMap.get(e.user_id)?.display_name ?? null,
      })),
      pendingAppeals: appealsRes.count ?? 0,
      activeStaff: staffRoles?.length ?? 0,
      recentActivity,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json(
      { error: "dashboard_stats_unavailable", message: "Failed to load dashboard statistics." },
      { status: 500 }
    );
  }
}
