/**
 * GET /api/moderation/users
 *   List users with search, filter and pagination. Returns basic profile
 *   info plus active enforcement records.
 *   Requires senior_moderator role or above.
 *
 * POST /api/moderation/users
 *   Create a user enforcement (warning, suspension, ban, restriction).
 *   Requires senior_moderator role or above.
 *
 * PATCH /api/moderation/users
 *   Revoke or modify a user enforcement.
 *   Requires senior_moderator role or above.
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
    const ctx = await requireModeratorRole("senior_moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/users", 60, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || undefined;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    let q = supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, is_private, created_at")
      .order("created_at", { ascending: false });

    if (search) {
      q = q.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;

    if (error) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const userIds = ((data ?? []) as any[]).map((row) => row.id);

    // Fetch active enforcements for these users.
    const { data: enforcements, error: enforcementError } = await supabase
      .from("user_enforcements")
      .select("user_id, type, reason, starts_at, ends_at, created_at")
      .in("user_id", userIds)
      .is("ends_at", null)
      .order("created_at", { ascending: false });

    if (enforcementError) {
      return NextResponse.json({ error: "internal_error" }, { status: 500 });
    }

    const enforcementMap = new Map<string, any[]>();
    (enforcements ?? []).forEach((e: any) => {
      const list = enforcementMap.get(e.user_id) ?? [];
      list.push(e);
      enforcementMap.set(e.user_id, list);
    });

    const users = ((data ?? []) as any[]).map((row) => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      isPrivate: row.is_private,
      createdAt: row.created_at,
      activeEnforcements: enforcementMap.get(row.id) ?? [],
    }));

    return NextResponse.json({
      users,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (err: any) {
    if (err.status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireModeratorRole("senior_moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/users", 30, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { targetUserId, type, reason, endsAt } = body;

    if (!targetUserId || typeof targetUserId !== "string") {
      return badRequest("targetUserId is required.");
    }

    const validTypes = ["warning", "suspension", "ban", "restriction"];
    if (!type || !validTypes.includes(type)) {
      return badRequest("Invalid enforcement type.");
    }

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return badRequest("Reason is required.");
    }

    if (reason.trim().length > 1000) {
      return badRequest("Reason is too long (maximum 1000 characters).");
    }

    // Verify target user exists.
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profileError || !targetProfile) {
      return NextResponse.json({ error: "user_not_found" }, { status: 404 });
    }

    // Prevent self-enforcement.
    if (targetUserId === ctx.userId) {
      return NextResponse.json({ error: "cannot_enforce_self" }, { status: 400 });
    }

    const startsAt = new Date().toISOString();

    const { data: enforcement, error: insertError } = await supabase
      .from("user_enforcements")
      .insert({
        user_id: targetUserId,
        type,
        reason: reason.trim(),
        starts_at: startsAt,
        ends_at: endsAt ?? null,
          created_by: ctx.userId!,
      })
      .select("id, user_id, type, reason, starts_at, ends_at, created_by, created_at")
      .single();

    if (insertError) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "user",
      targetId: targetUserId,
      action: `create_enforcement_${type}`,
      details: { reason: reason.trim(), ends_at: endsAt || null },
      afterState: { type, reason: reason.trim(), ends_at: endsAt || null },
    });

    return NextResponse.json({ enforcement }, { status: 201 });
  } catch (err: any) {
    if (err.status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireModeratorRole("senior_moderator", request);
    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId, ip: getClientIp(request) }), "/api/moderation/users", 30, 60);
    if (!rl.allowed) return rl.response!;
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { enforcementId, action, revokedReason } = body;

    if (!enforcementId || typeof enforcementId !== "string") {
      return badRequest("enforcementId is required.");
    }

    const validActions = ["revoke"];
    if (!action || !validActions.includes(action)) {
      return badRequest("Invalid action.");
    }

    // Verify the enforcement exists and is active (not already revoked).
    const { data: enforcement, error: enforcementError } = await supabase
      .from("user_enforcements")
      .select("id, user_id, type, revoked_reason")
      .eq("id", enforcementId)
      .is("revoked_reason", null)
      .maybeSingle();

    if (enforcementError || !enforcement) {
      return NextResponse.json({ error: "enforcement_not_found" }, { status: 404 });
    }

    const beforeState = { type: enforcement.type, revoked_reason: enforcement.revoked_reason };

    const { error: updateError } = await supabase
      .from("user_enforcements")
      .update({
        revoked_reason: revokedReason ?? null,
        reviewed_by: ctx.userId!,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", enforcementId);

    if (updateError) {
      return NextResponse.json({ error: "internal_error" }, { status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "user",
      targetId: enforcement.user_id,
      action: "revoke_enforcement",
      details: { enforcement_type: enforcement.type, revoked_reason: revokedReason || null },
      beforeState,
      afterState: { revoked_reason: revokedReason || null },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err.status === 401) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (err.status === 403) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
