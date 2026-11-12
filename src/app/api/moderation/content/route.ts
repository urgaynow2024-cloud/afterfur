/**
 * GET /api/moderation/content
 *   List recent content for moderation queue OR fetch a specific item.
 *   Query: target_type + target_id for single item; type=post|reply&page&pageSize for list.
 *   Requires moderator role or above.
 *
 * POST /api/moderation/content
 *   Remove or restore content using moderation_status (migration 0034) with
 *   audit logging. Requires moderator role or above.
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
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/content", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const targetType = url.searchParams.get("target_type");
    const targetId = url.searchParams.get("target_id");
    const listType = url.searchParams.get("type") || "post";
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    // Single item lookup
    if (targetType && targetId) {
      if (!["post", "reply"].includes(targetType)) return badRequest("target_type must be 'post' or 'reply'.");
      const table = targetType === "post" ? "posts" : "replies";
      const selectCols = targetType === "post"
        ? "id, author_id, content, classification, created_at, media_urls, moderation_status, moderated_at, moderation_reason"
        : "id, post_id, author_id, content, created_at, parent_reply_id, moderation_status, moderated_at, moderation_reason";

      const { data: content, error: contentError } = await supabase.from(table).select(selectCols).eq("id", targetId).maybeSingle();
      if (contentError || !content) return NextResponse.json({ error: "content_not_found" }, { status: 404 });

      const { data: authorProfile } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, is_private")
        .eq("id", (content as any).author_id)
        .maybeSingle();

      return NextResponse.json({ content, author: authorProfile ?? null });
    }

    // List mode (queue browsing)
    const type = listType === "reply" ? "reply" : "post";
    const table = type === "post" ? "posts" : "replies";
    const selectCols = type === "post"
      ? "id, author_id, content, classification, created_at, media_urls, moderation_status, moderated_at, moderation_reason"
      : "id, post_id, author_id, content, created_at, parent_reply_id, moderation_status, moderated_at, moderation_reason";

    const { data, error, count } = await supabase
      .from(table)
      .select(selectCols, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ error: "internal_error" }, { status: 500 });

    const rows = (data ?? []) as any[];
    const authorIds = [...new Set(rows.map((r) => r.author_id).filter(Boolean))];
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url, is_private").in("id", authorIds)
      : { data: [] as any[] };
    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));

    const items = rows.map((r) => ({
      ...r,
      moderation_status: r.moderation_status ?? "visible",
      author: profileMap.get(r.author_id) ?? null,
    }));

    return NextResponse.json({ items, page, pageSize, total: count ?? 0, type });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId!, ip: getClientIp(request) }), "/api/moderation/content", 30, 60);
    if (!rl.allowed) return rl.response;

    const body = await request.json();
    const { targetType, targetId, action, reason } = body;

    if (!targetType || !["post", "reply"].includes(targetType)) return badRequest("target_type must be 'post' or 'reply'.");
    if (!targetId || typeof targetId !== "string") return badRequest("targetId is required.");
    if (!action || !["remove", "restore"].includes(action)) return badRequest("action must be 'remove' or 'restore'.");
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) return badRequest("Reason is required.");

    const table = targetType === "post" ? "posts" : "replies";
    const selectCols = targetType === "post"
      ? "id, author_id, content, classification, moderation_status, moderation_reason"
      : "id, post_id, author_id, content, moderation_status, moderation_reason";

    const { data: existing, error: existingError } = await supabase.from(table).select(selectCols).eq("id", targetId).maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: "content_not_found" }, { status: 404 });

    const beforeState = {
      author_id: (existing as any).author_id,
      moderation_status: (existing as any).moderation_status ?? "visible",
      classification: (existing as any).classification ?? null,
    };

    const nextStatus = action === "remove" ? "removed" : "visible";
    const updatePayload: Record<string, unknown> = {
      moderation_status: nextStatus,
      moderated_at: new Date().toISOString(),
      moderated_by: ctx.userId,
      moderation_reason: reason.trim(),
    };

    const { error: updateError } = await supabase.from(table).update(updatePayload).eq("id", targetId);
    if (updateError) {
      // Fallback: if migration 0034 not applied, record action in audit only.
      // This keeps the system functional in dev before migration is applied.
      await recordModerationAction({
        actorId: ctx.userId!,
        targetType,
        targetId,
        action: `content_${action}_audit_only`,
        details: { reason: reason.trim(), note: "Apply migration 0034_moderation_content_status.sql to persist moderation_status." },
        beforeState,
        afterState: { moderation_status: nextStatus, reason: reason.trim() },
      });
      return NextResponse.json({ error: "content_status_update_failed", message: "Could not update content status. Apply required moderation migrations." }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType,
      targetId,
      action: `content_${action}`,
      details: { reason: reason.trim(), previous_moderation_status: beforeState.moderation_status },
      beforeState,
      afterState: { moderation_status: nextStatus, moderation_reason: reason.trim() },
    });

    return NextResponse.json({ ok: true, action, moderation_status: nextStatus });
  } catch (err: any) {
    if (err.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
