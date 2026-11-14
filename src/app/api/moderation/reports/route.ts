/**
 * GET /api/moderation/reports
 *   List moderation reports with filters, search, sorting and pagination.
 *   Requires moderator role or above.
 *   Query: status, reason, target_type, priority, search, dateFrom, dateTo,
 *   sort (newest|oldest|priority), page, pageSize.
 *   Search matches reporter username/display name, reported username/display
 *   name (for account reports and for authors of reported posts/replies) and
 *   report id.
 *
 * POST /api/moderation/reports
 *   Assign (or unassign) a report.
 *   Body: { reportId, assignedTo?: string | null }
 *   - assignedTo omitted  -> assign to the current moderator.
 *   - assignedTo null     -> unassign.
 *   - assignedTo <uuid>   -> must be an existing moderator.
 *   Requires moderator role or above.
 *
 * PATCH /api/moderation/reports
 *   Change status, record an internal note, or both.
 *   Body: { reportId, status?, moderatorNotes? }
 *   - A reason (moderatorNotes) is required for dismissed/actioned.
 *   - Internal notes are stored in report_notes (staff-only); they are never
 *     written to reports.description, which is reporter-visible.
 *   - Conflicting transitions on an already-terminal report are rejected (409).
 *   - Status updates use optimistic concurrency to avoid two moderators
 *     resolving the same report simultaneously.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { PRIORITY_REASONS, isUuid, reportPriority } from "@/lib/reportMeta";

const VALID_STATUSES = ["pending", "reviewed", "dismissed", "actioned"] as const;
const TERMINAL_STATUSES = ["dismissed", "actioned"] as const;

function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const value = (err as { status?: unknown }).status;
    return typeof value === "number" ? value : undefined;
  }
  return undefined;
}

type SupabaseLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

function isMissingRelationError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
  const hay = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (
    (hay.includes("does not exist") && (hay.includes("relation") || hay.includes("table") || hay.includes("column"))) ||
    hay.includes("could not find the table")
  );
}

const MIGRATION_REQUIRED_MESSAGE =
  "Moderator database setup is incomplete. Apply the pending moderation migrations (0033, 0034, 0058) to the target database, then reload this page.";

type ReportRecord = { id: string; status: string; assigned_to: string | null };
type ReportMutationBody = {
  reportId?: unknown;
  assignedTo?: string | null;
  status?: unknown;
  moderatorNotes?: unknown;
};

function parseSort(sort: string | null): "newest" | "oldest" | "priority" {
  if (sort === "oldest") return "oldest";
  if (sort === "priority") return "priority";
  return "newest";
}

function parsePriority(priority: string | null): "high" | "medium" | "low" | null {
  if (priority === "high" || priority === "medium" || priority === "low") return priority;
  return null;
}

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  description: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  assigned_to: string | null;
  assigned_at: string | null;
  created_at: string | null;
  reporter?: { username: string | null; display_name: string | null; avatar_url: string | null } | null;
  assignee?: { username: string | null; display_name: string | null } | null;
};

function mapReport(row: ReportRow) {
  const priority = reportPriority(row.reason);
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
    assigned_to: row.assigned_to,
    assigned_at: row.assigned_at,
    created_at: row.created_at,
    reporter_username: row.reporter?.username ?? null,
    reporter_display_name: row.reporter?.display_name ?? null,
    reporter_avatar_url: row.reporter?.avatar_url ?? null,
    assignee_username: row.assignee?.username ?? null,
    assignee_display_name: row.assignee?.display_name ?? null,
    priority,
  };
}

/**
 * Resolve a free-text search into a PostgREST `or` filter covering reporter,
 * reported user/author, reason and report id. Returns null when the search is
 * blank so callers can skip the filter entirely.
 */
async function buildSearchFilter(
  supabase: NonNullable<ReturnType<typeof createServerClient>>,
  search: string | null,
): Promise<string | null> {
  const raw = (search ?? "").trim();
  if (!raw) return null;
  // Commas/parentheses are PostgREST `or` syntax; strip them from user input.
  const term = raw.replace(/[,()\\]/g, " ").trim();
  if (!term) return null;

  const orParts: string[] = [`reason.ilike.%${term}%`];
  if (isUuid(raw)) orParts.unshift(`id.eq.${raw}`);

  const { data: matchedProfiles } = await supabase
    .from("profiles")
    .select("id")
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(100);

  const profileIds = ((matchedProfiles ?? []) as Array<{ id: string }>).map((p) => p.id).filter(Boolean);
  if (profileIds.length > 0) {
    orParts.push(`reporter_id.in.(${profileIds.join(",")})`);

    // Also match authors of reported posts/replies so "reported username"
    // search works for content reports (target_id is content, not author).
    const [postsRes, repliesRes] = await Promise.all([
      supabase.from("posts").select("id").in("author_id", profileIds).limit(500),
      supabase.from("replies").select("id").in("author_id", profileIds).limit(500),
    ]);
    const contentIds = [
      ...(((postsRes.data ?? []) as Array<{ id: string }>).map((p) => p.id)),
      ...(((repliesRes.data ?? []) as Array<{ id: string }>).map((r) => r.id)),
    ].filter(Boolean);
    const targetIds = [...profileIds, ...contentIds];
    orParts.push(`target_id.in.(${targetIds.join(",")})`);
  }

  return orParts.join(",");
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
    const targetId = url.searchParams.get("target_id") || undefined;
    const reportId = url.searchParams.get("id") || undefined;
    const reason = url.searchParams.get("reason") || undefined;
    const priority = parsePriority(url.searchParams.get("priority"));
    const search = url.searchParams.get("search") || undefined;
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const sort = parseSort(url.searchParams.get("sort"));
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10) || 20));
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from("reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, description, status, reviewed_by, reviewed_at, assigned_to, assigned_at, created_at, reporter:profiles!reports_reporter_id_fkey(username, display_name, avatar_url), assignee:profiles!reports_assigned_to_fkey(username, display_name)",
        { count: "exact" },
      );

    if (reportId) {
      if (!isUuid(reportId)) return badRequest("Invalid report id.");
      q = q.eq("id", reportId);
    }
    if (status) q = q.eq("status", status);
    if (targetType) q = q.eq("target_type", targetType);
    if (targetId) q = q.eq("target_id", targetId);
    if (reason) q = q.eq("reason", reason);
    if (priority) q = q.in("reason", PRIORITY_REASONS[priority]);
    if (dateFrom) q = q.gte("created_at", dateFrom);
    if (dateTo) q = q.lte("created_at", dateTo);

    const searchFilter = await buildSearchFilter(supabase, search ?? null);
    if (searchFilter) q = q.or(searchFilter);

    // SQL ordering handles newest/oldest. Priority is derived and applied in
    // memory below (applies to the returned page).
    q = q.order("created_at", { ascending: sort === "oldest" });
    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      if (isMissingRelationError(error)) {
        return NextResponse.json(
          { error: "migration_required", code: "migration_required", message: MIGRATION_REQUIRED_MESSAGE },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const reports = ((data ?? []) as unknown as ReportRow[]).map((row) => mapReport(row));

    let sorted = reports;
    if (sort === "priority") {
      sorted = [...reports].sort(
        (a, b) =>
          b.priority.rank - a.priority.rank ||
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
      );
    }

    return NextResponse.json({
      reports: sorted,
      page,
      pageSize,
      total: count ?? 0,
      sort,
    });
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

    const body = (await request.json().catch(() => null)) as ReportMutationBody | null;
    const reportId = body?.reportId;
    const hasAssignedTo = Object.prototype.hasOwnProperty.call(body ?? {}, "assignedTo");
    const assignedTo = body?.assignedTo;

    if (!reportId || typeof reportId !== "string" || !isUuid(reportId)) {
      return badRequest("A valid reportId is required.");
    }

    // Resolve the target moderator: omitted -> self, null -> unassign, uuid -> that moderator.
    let assigneeId: string | null;
    if (!hasAssignedTo || assignedTo === undefined) {
      assigneeId = ctx.userId ?? null;
    } else if (assignedTo === null) {
      assigneeId = null;
    } else if (typeof assignedTo === "string" && isUuid(assignedTo)) {
      assigneeId = assignedTo;
    } else {
      return badRequest("assignedTo must be a moderator id or null.");
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status, assigned_to")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    }
    const reportRecord = report as unknown as ReportRecord;

    if (TERMINAL_STATUSES.includes(reportRecord.status as (typeof TERMINAL_STATUSES)[number])) {
      return NextResponse.json(
        { error: "report_already_processed", message: `This report is already ${reportRecord.status}.` },
        { status: 409 },
      );
    }

    // Authorise assignment: the target must actually be a moderator.
    if (assigneeId && assigneeId !== ctx.userId) {
      const { data: roleRow, error: roleError } = await supabase
        .from("moderator_roles")
        .select("user_id, role")
        .eq("user_id", assigneeId)
        .maybeSingle();
      if (roleError || !roleRow) {
        return NextResponse.json(
          { error: "assignee_not_moderator", message: "The selected user is not an authorised moderator." },
          { status: 403 },
        );
      }
    }

    if (assigneeId && assigneeId === reportRecord.assigned_to) {
      return NextResponse.json({ ok: true, assignedTo: assigneeId, unchanged: true });
    }

    const { error: updateError } = await supabase
      .from("reports")
      .update({
        assigned_to: assigneeId,
        assigned_at: assigneeId ? new Date().toISOString() : null,
      })
      .eq("id", reportId);

    if (updateError) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "report",
      targetId: reportId,
      action: assigneeId ? "assign_report" : "unassign_report",
      details: { assigned_to: assigneeId },
      beforeState: { assigned_to: reportRecord.assigned_to ?? null },
      afterState: { assigned_to: assigneeId },
    });

    return NextResponse.json({ ok: true, assignedTo: assigneeId });
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
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

    const body = (await request.json().catch(() => null)) as ReportMutationBody | null;
    const reportId = body?.reportId;
    const newStatus: string | undefined = typeof body?.status === "string" ? body.status : undefined;
    const moderatorNotes: string | undefined =
      typeof body?.moderatorNotes === "string" ? body.moderatorNotes.trim() : undefined;

    if (!reportId || typeof reportId !== "string" || !isUuid(reportId)) {
      return badRequest("A valid reportId is required.");
    }

    if (newStatus !== undefined && !VALID_STATUSES.includes(newStatus as (typeof VALID_STATUSES)[number])) {
      return badRequest("Invalid status.");
    }
    if (newStatus === undefined && !moderatorNotes) {
      return badRequest("Provide a status change or an internal note.");
    }
    if (moderatorNotes !== undefined && moderatorNotes.length > 2000) {
      return badRequest("Moderator note is too long (maximum 2000 characters).");
    }

    // A reason is required for every terminal moderation decision.
    const isTerminal = newStatus === "dismissed" || newStatus === "actioned";
    if (isTerminal && (!moderatorNotes || moderatorNotes.length === 0)) {
      return badRequest("A moderator reason is required when dismissing or actioning a report.");
    }

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status, description")
      .eq("id", reportId)
      .maybeSingle();

    if (reportError || !report) {
      return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    }

    const currentStatus = (report as unknown as { status: string }).status;
    const beforeState = { status: currentStatus };

    // A closed report cannot be resolved again. This also rejects a second
    // moderator who reads the row after another moderator already closed it.
    if (newStatus !== undefined && TERMINAL_STATUSES.includes(currentStatus as (typeof TERMINAL_STATUSES)[number])) {
      return NextResponse.json(
        { error: "report_already_processed", message: `This report is already ${currentStatus}.` },
        { status: 409 },
      );
    }

    if (newStatus !== undefined && newStatus !== currentStatus) {
      // Optimistic concurrency: only update if the status has not changed since
      // it was read. A zero-row result means another moderator won the race.
      // reviewed_by/reviewed_at record the moderator who resolved the report.
      // "Under review" is ownership, not resolution, so it leaves them untouched.
      const updatePayload: Record<string, unknown> = { status: newStatus };
      if (newStatus === "dismissed" || newStatus === "actioned") {
        updatePayload.reviewed_by = ctx.userId;
        updatePayload.reviewed_at = new Date().toISOString();
      } else if (newStatus === "pending") {
        updatePayload.reviewed_by = null;
        updatePayload.reviewed_at = null;
      }

      const { data: updated, error: updateError } = await supabase
        .from("reports")
        .update(updatePayload)
        .eq("id", reportId)
        .eq("status", currentStatus)
        .select("id");

      if (updateError) {
        return NextResponse.json({ error: "internal_error" }, { status: 400 });
      }
      if (!updated || updated.length === 0) {
        return NextResponse.json(
          { error: "report_already_processed", message: "This report was updated by another moderator." },
          { status: 409 },
        );
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
    }

    // Internal notes are stored separately from the reporter-visible description.
    if (moderatorNotes) {
      const { error: noteError } = await supabase
        .from("report_notes")
        .insert({ report_id: reportId, author_id: ctx.userId!, body: moderatorNotes });
      if (noteError) {
        return NextResponse.json({ error: "note_failed", message: "Failed to save the internal note." }, { status: 400 });
      }
      await recordModerationAction({
        actorId: ctx.userId!,
        targetType: "report",
        targetId: reportId,
        action: "add_report_note",
        details: { note_length: moderatorNotes.length },
        beforeState,
        afterState: { status: newStatus ?? currentStatus },
      });
    }

    return NextResponse.json({ ok: true, status: newStatus ?? currentStatus });
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}