/**
 * GET /api/moderation/reports
 *   List moderation reports with filters, search, sorting and pagination.
 *   Requires moderator role or above.
 *
 * POST /api/moderation/reports
 *   Assign a report to a moderator.
 *   Requires moderator role or above.
 *
 * PATCH /api/moderation/reports
 *   Resolve, dismiss or action a report with moderator notes.
 *   Requires moderator role or above.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/reports", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const targetType = url.searchParams.get("target_type") || undefined;
    const search = url.searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from("reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, description, status, reviewed_by, reviewed_at, created_at, profiles!reports_reporter_id_fkey(username, display_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);
    if (targetType) q = q.eq("target_type", targetType);
    if (search) {
      q = q.ilike("reason", `%${search}%`);
    }

    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const reports = ((data ?? []) as any[]).map((row) => {
      const reporterProfile = row.profiles;
      return {
        id: row.id,
        reporter_id: row.reporter_id,
        target_type: row.target_type,
        target_id: row.target_id,
        reason: row.reason,
        description: row.description,
        status: row.status,
        reviewed_by: row.reviewed_by,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
        reporter_username: reporterProfile?.username ?? null,
        reporter_display_name: reporterProfile?.display_name ?? null,
      };
    });

    return NextResponse.json({
      reports,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId!, ip: getClientIp(request) }), "/api/moderation/reports", 30, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reportId, assignedTo } = body;

    if (!reportId || typeof reportId !== "string") {
      return badRequest("reportId is required.");
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    }

    if ((report as any).status !== "pending" && (report as any).status !== "reviewed") {
      return NextResponse.json({ error: "report_already_processed" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("reports")
      .update({
        reviewed_by: assignedTo || ctx.userId,
        reviewed_at: assignedTo ? new Date().toISOString() : null,
        status: assignedTo ? "reviewed" : "pending",
      })
      .eq("id", reportId);

    if (updateError) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "report",
      targetId: reportId,
      action: assignedTo ? "assign_report" : "unassign_report",
      details: { assigned_to: assignedTo || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId!, ip: getClientIp(request) }), "/api/moderation/reports", 30, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reportId, status: newStatus, moderatorNotes } = body;

    if (!reportId || typeof reportId !== "string") {
      return badRequest("reportId is required.");
    }

    const validStatuses = ["pending", "reviewed", "dismissed", "actioned"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return badRequest("Invalid status.");
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status, description")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    }

    const beforeState = { status: (report as any).status };

    const { error: updateError } = await supabase
      .from("reports")
      .update({
        status: newStatus,
        reviewed_by: ctx.userId,
        reviewed_at: new Date().toISOString(),
        description:
          moderatorNotes && moderatorNotes.trim().length > 0
            ? `${(report as any).description ?? ""}\n\n[Moderator note: ${moderatorNotes.trim()}]`.trim()
            : (report as any).description,
      })
      .eq("id", reportId);

    if (updateError) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "report",
      targetId: reportId,
      action: `resolve_report_${newStatus}`,
      details: { new_status: newStatus, moderator_notes: moderatorNotes || null },
      beforeState,
      afterState: { status: newStatus },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
