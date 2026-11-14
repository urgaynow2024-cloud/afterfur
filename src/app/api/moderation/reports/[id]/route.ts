/**
 * GET /api/moderation/reports/[id]
 *   Detailed investigation view for a single report.
 *   Requires moderator role or above.
 *   Returns the report, reporter profile, reported user/author profile, the
 *   reported post/reply/media or account, assigned/reviewing moderators,
 *   internal notes (staff-only) and previous moderation actions.
 *
 * POST /api/moderation/reports/[id]
 *   Add an internal moderator note.
 *   Body: { note: string }
 *   Requires moderator role or above.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { isUuid, reportPriority } from "@/lib/reportMeta";

const MIGRATION_REQUIRED_MESSAGE =
  "Moderator database setup is incomplete. Apply migrations 0033, 0034 and 0058 to the target database, then reload this page. Migrations must not be applied to production automatically.";

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

function migrationRequired(context: string) {
  return NextResponse.json(
    { error: "migration_required", code: "migration_required", message: MIGRATION_REQUIRED_MESSAGE, missing: context },
    { status: 503 },
  );
}

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

type ProfileRef = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string | null;
  is_private: boolean | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const { id: reportId } = await params;
    if (!isUuid(reportId)) return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/reports/[id]", 120, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { data: reportRow, error: reportError } = await supabase
      .from("reports")
      .select(
        "id, reporter_id, target_type, target_id, reason, description, status, reviewed_by, reviewed_at, assigned_to, assigned_at, created_at, reporter:profiles!reports_reporter_id_fkey(id, username, display_name, avatar_url, bio, created_at, is_private), assignee:profiles!reports_assigned_to_fkey(id, username, display_name, avatar_url, bio, created_at, is_private), reviewer:profiles!reports_reviewed_by_fkey(id, username, display_name, avatar_url, bio, created_at, is_private)",
      )
      .eq("id", reportId)
      .maybeSingle();

    if (reportError) {
      if (isMissingRelationError(reportError)) return migrationRequired("reports");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (!reportRow) return NextResponse.json({ error: "report_not_found" }, { status: 404 });

    const report = reportRow as unknown as {
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
      reporter: ProfileRef | null;
      assignee: ProfileRef | null;
      reviewer: ProfileRef | null;
    };
    const priority = reportPriority(report.reason);

    // Resolve the reported content (post/reply/media) or account.
    let targetContent: Record<string, unknown> | null = null;
    let reportedUser: ProfileRef | null = null;

    if (report.target_type === "post" || report.target_type === "reply") {
      const table = report.target_type === "post" ? "posts" : "replies";
      const selectCols =
        report.target_type === "post"
          ? "id, author_id, content, classification, created_at, media_urls, moderation_status, moderated_at, moderation_reason"
          : "id, post_id, author_id, content, created_at, parent_reply_id, moderation_status, moderated_at, moderation_reason";
      const { data: content, error: contentError } = await supabase
        .from(table)
        .select(selectCols)
        .eq("id", report.target_id)
        .maybeSingle();
      if (contentError && isMissingRelationError(contentError)) return migrationRequired(table);
      if (!contentError && content) {
        const contentRow = content as unknown as {
          id: string;
          author_id?: string | null;
          content?: string;
          post_id?: string | null;
          parent_reply_id?: string | null;
          classification?: string | null;
          created_at?: string | null;
          media_urls?: string[] | null;
          moderation_status?: string | null;
          moderation_reason?: string | null;
        };
        targetContent = {
          type: report.target_type,
          ...contentRow,
          media_urls: contentRow.media_urls ?? null,
        };
        if (contentRow.author_id) {
          const { data: author } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, bio, created_at, is_private")
            .eq("id", contentRow.author_id)
            .maybeSingle();
          reportedUser = (author as ProfileRef) ?? null;
        }
      }
    } else if (report.target_type === "user") {
      const { data: user, error: userError } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, created_at, is_private")
        .eq("id", report.target_id)
        .maybeSingle();
      if (userError && isMissingRelationError(userError)) return migrationRequired("profiles");
      reportedUser = (user as ProfileRef) ?? null;
      targetContent = reportedUser
        ? { type: "user", id: reportedUser.id, username: reportedUser.username, display_name: reportedUser.display_name }
        : null;
    }

    const { data: notesRows, error: notesError } = await supabase
      .from("report_notes")
      .select("id, report_id, author_id, body, created_at, author:profiles!report_notes_author_id_fkey(username, display_name)")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true });

    if (notesError) {
      if (isMissingRelationError(notesError)) return migrationRequired("report_notes");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const { data: actionRows, error: actionError } = await supabase
      .from("moderation_audit_log")
      .select(
        "id, actor_id, target_type, target_id, action, details, before_state, after_state, created_at, actor:profiles!moderation_audit_log_actor_id_fkey(username, display_name)",
      )
      .eq("target_type", "report")
      .eq("target_id", reportId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (actionError) {
      if (isMissingRelationError(actionError)) return migrationRequired("moderation_audit_log");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const notes = ((notesRows ?? []) as unknown as Array<{
      id: string;
      report_id: string;
      author_id: string;
      body: string;
      created_at: string | null;
      author?: { username: string | null; display_name: string | null } | null;
    }>).map((n) => ({
      id: n.id,
      reportId: n.report_id,
      authorId: n.author_id,
      authorUsername: n.author?.username ?? null,
      authorDisplayName: n.author?.display_name ?? null,
      body: n.body,
      createdAt: n.created_at,
    }));

    const actions = ((actionRows ?? []) as unknown as Array<{
      id: string;
      actor_id: string;
      target_type: string;
      target_id: string;
      action: string;
      details: Record<string, unknown> | null;
      before_state: Record<string, unknown> | null;
      after_state: Record<string, unknown> | null;
      created_at: string | null;
      actor?: { username: string | null; display_name: string | null } | null;
    }>).map((a) => ({
      id: a.id,
      actorId: a.actor_id,
      actorUsername: a.actor?.username ?? null,
      actorDisplayName: a.actor?.display_name ?? null,
      targetType: a.target_type,
      targetId: a.target_id,
      action: a.action,
      details: a.details ?? null,
      beforeState: a.before_state ?? null,
      afterState: a.after_state ?? null,
      createdAt: a.created_at,
    }));

    return NextResponse.json({
      ok: true,
      report: {
        id: report.id,
        reporterId: report.reporter_id,
        targetType: report.target_type,
        targetId: report.target_id,
        reason: report.reason,
        description: report.description,
        status: report.status,
        reviewedBy: report.reviewed_by,
        reviewedAt: report.reviewed_at,
        assignedTo: report.assigned_to,
        assignedAt: report.assigned_at,
        createdAt: report.created_at,
        priority,
      },
      reporter: (report.reporter as ProfileRef) ?? null,
      reportedUser,
      targetContent,
      assignee: (report.assignee as ProfileRef) ?? null,
      reviewer: (report.reviewer as ProfileRef) ?? null,
      notes,
      actions,
    });
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const { id: reportId } = await params;
    if (!isUuid(reportId)) return NextResponse.json({ error: "report_not_found" }, { status: 404 });
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId!, ip: getClientIp(request) }), "/api/moderation/reports/[id]", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = (await request.json().catch(() => null)) as { note?: unknown } | null;
    const note = typeof body?.note === "string" ? body.note.trim() : "";

    if (!note) return badRequest("A note body is required.");
    if (note.length > 2000) return badRequest("Note is too long (maximum 2000 characters).");

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .select("id, status")
      .eq("id", reportId)
      .maybeSingle();
    if (reportError) {
      if (isMissingRelationError(reportError)) return migrationRequired("reports");
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }
    if (!report) return NextResponse.json({ error: "report_not_found" }, { status: 404 });

    const { data: inserted, error: insertError } = await supabase
      .from("report_notes")
      .insert({ report_id: reportId, author_id: ctx.userId!, body: note })
      .select("id, report_id, author_id, body, created_at")
      .single();

    if (insertError) {
      if (isMissingRelationError(insertError)) return migrationRequired("report_notes");
      return NextResponse.json({ error: "note_failed", message: "Failed to save the internal note." }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "report",
      targetId: reportId,
      action: "add_report_note",
      details: { note_length: note.length },
      beforeState: { status: (report as { status: string }).status },
      afterState: { status: (report as { status: string }).status },
    });

    const noteRow = inserted as unknown as {
      id: string;
      report_id: string;
      author_id: string;
      body: string;
      created_at: string | null;
    };
    return NextResponse.json({
      ok: true,
      note: {
        id: noteRow.id,
        reportId: noteRow.report_id,
        authorId: noteRow.author_id,
        authorUsername: null,
        authorDisplayName: null,
        body: noteRow.body,
        createdAt: noteRow.created_at,
      },
    });
  } catch (err) {
    const status = statusOf(err);
    if (status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}