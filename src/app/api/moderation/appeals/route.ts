/**
 * GET /api/moderation/appeals
 *   List appeals with optional status filter, pagination.
 *   Requires moderator role or above.
 *
 * POST /api/moderation/appeals
 *   Submit a new appeal (authenticated user, their own appeal).
 *   Requires authentication only.
 *
 * PATCH /api/moderation/appeals
 *   Accept or reject an appeal and notify the user.
 *   Requires moderator role or above.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

async function notifyAppealDecision(supabase: ReturnType<typeof createServerClient>, userId: string, status: "accepted" | "rejected", responseMessage?: string | null) {
  if (!supabase) return;
  try {
    // Best-effort notification; type is free-form in schema and payload is JSON.
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "appeal_decision",
      payload: { status, response_message: responseMessage ?? null },
      read: false,
    } as any);
  } catch {
    // Non-fatal: appeal decision is already persisted.
  }
}

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/appeals", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from("appeals")
      .select(
        "id, user_id, report_id, enforcement_type, enforcement_id, reason, status, reviewed_by, reviewed_at, response_message, created_at, profiles!appeals_user_id_fkey(username, display_name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);
    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });

    const appeals = ((data ?? []) as any[]).map((row) => {
      const userProfile = row.profiles;
      return {
        id: row.id,
        userId: row.user_id,
        userUsername: userProfile?.username ?? null,
        userDisplayName: userProfile?.display_name ?? null,
        reportId: row.report_id,
        enforcementType: row.enforcement_type,
        enforcementId: row.enforcement_id,
        reason: row.reason,
        status: row.status,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        responseMessage: row.response_message,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ appeals, page, pageSize, total: count ?? 0 });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const authUser = await getVerifiedUser(request);
    if (!authUser?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const userId = authUser.id;

    const rl = await rateLimit(getRateLimitKey({ userId, ip: getClientIp(request) }), "/api/moderation/appeals", 10, 60);
    if (!rl.allowed) return rl.response;

    const body = await request.json();
    const { reportId, enforcementType, enforcementId, reason } = body;

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) return badRequest("Reason is required.");
    if (reason.trim().length > 1000) return badRequest("Reason is too long (maximum 1000 characters).");

    const validEnforcementTypes = ["warning", "suspension", "ban", "restriction", "content_removal"];
    if (enforcementType && !validEnforcementTypes.includes(enforcementType)) return badRequest("Invalid enforcement type.");

    if (enforcementType && enforcementId) {
      const { data: existingAppeal } = await supabase
        .from("appeals")
        .select("id")
        .eq("user_id", userId)
        .eq("enforcement_type", enforcementType)
        .eq("enforcement_id", enforcementId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingAppeal) return NextResponse.json({ error: "appeal_already_pending" }, { status: 400 });
    }

    const { data: appeal, error: insertError } = await supabase
      .from("appeals")
      .insert({
        user_id: userId,
        report_id: reportId || null,
        enforcement_type: enforcementType || null,
        enforcement_id: enforcementId || null,
        reason: reason.trim(),
        status: "pending",
      })
      .select("id, user_id, status, created_at")
      .single();

    if (insertError) return NextResponse.json({ error: "internal_error" }, { status: 400 });

    await recordModerationAction({
      actorId: userId,
      targetType: "appeal",
      targetId: appeal.id,
      action: "create_appeal",
      details: { enforcement_type: enforcementType || null, enforcement_id: enforcementId || null },
      afterState: { status: "pending" },
    });

    return NextResponse.json({ appeal }, { status: 201 });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId!, ip: getClientIp(request) }), "/api/moderation/appeals", 30, 60);
    if (!rl.allowed) return rl.response;

    const body = await request.json();
    const { appealId, status: newStatus, responseMessage } = body;

    if (!appealId || typeof appealId !== "string") return badRequest("appealId is required.");
    if (!newStatus || !["accepted", "rejected"].includes(newStatus)) return badRequest("Invalid status. Must be 'accepted' or 'rejected'.");

    const { data: appeal, error: appealError } = await supabase
      .from("appeals")
      .select("id, user_id, status, enforcement_type, enforcement_id")
      .eq("id", appealId)
      .maybeSingle();

    if (appealError || !appeal) return NextResponse.json({ error: "appeal_not_found" }, { status: 404 });
    if ((appeal as any).status !== "pending") return NextResponse.json({ error: "appeal_already_processed" }, { status: 400 });

    const beforeState = { status: (appeal as any).status };
    const { error: updateError } = await supabase
      .from("appeals")
      .update({
        status: newStatus,
        reviewed_by: ctx.userId!,
        reviewed_at: new Date().toISOString(),
        response_message: responseMessage || null,
      })
      .eq("id", appealId);

    if (updateError) return NextResponse.json({ error: "internal_error" }, { status: 400 });

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "appeal",
      targetId: appealId,
      action: `appeal_${newStatus}`,
      details: {
        appeal_user_id: appeal.user_id,
        enforcement_type: appeal.enforcement_type,
        response_message: responseMessage || null,
      },
      beforeState,
      afterState: { status: newStatus },
    });

    await notifyAppealDecision(supabase, (appeal as any).user_id, newStatus, responseMessage);

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
