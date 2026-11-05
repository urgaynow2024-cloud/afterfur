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

type SupabaseLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

const MIGRATION_REQUIRED_MESSAGE =
  "Moderator database setup is incomplete. Apply migrations 0033_moderator_administration.sql and 0034_moderation_content_status.sql (and any pending moderation migrations) to the target database, then reload this page. Migrations must not be applied to production automatically.";

function isMissingRelationError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  // Postgres undefined_table / PostgREST relation-not-found cases.
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
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
        // Safe, non-sensitive context only (no raw DB message/credentials).
        missing: context,
      },
      { status: 503 }
    );
  }
  // Log a sanitized server-side marker only in non-production contexts if desired;
  // never include credentials/raw DB details in the response.
  return NextResponse.json(
    { error: "dashboard_stats_unavailable", message: "Failed to load dashboard statistics." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    await requireModeratorRole("moderator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: reportsByStatus, error: reportsError } = await supabase.from("reports").select("status");
    if (reportsError) return dbFailureResponse(reportsError, "reports");

    const statusCounts = (reportsByStatus ?? []).reduce((acc: Record<string, number>, row: { status: string }) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {});

    const recentReportsRes = await supabase
      .from("reports")
      .select("id, target_type, reason, status, created_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);
    if (recentReportsRes.error) return dbFailureResponse(recentReportsRes.error, "reports");

    const enforcementsRes = await supabase
      .from("user_enforcements")
      .select("id, type, reason, created_at")
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);
    if (enforcementsRes.error) return dbFailureResponse(enforcementsRes.error, "user_enforcements");

    const appealsRes = await supabase
      .from("appeals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (appealsRes.error) return dbFailureResponse(appealsRes.error, "appeals");

    return NextResponse.json({
      ok: true,
      pendingReports: statusCounts.pending || 0,
      reviewedReports: statusCounts.reviewed || 0,
      dismissedReports: statusCounts.dismissed || 0,
      actionedReports: statusCounts.actioned || 0,
      totalReports: (reportsByStatus ?? []).length,
      recentReports: recentReportsRes.data ?? [],
      recentEnforcements: enforcementsRes.data ?? [],
      pendingAppeals: appealsRes.count ?? 0,
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
