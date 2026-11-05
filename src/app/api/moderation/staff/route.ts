/**
 * GET /api/moderation/staff
 *   List staff members (moderator_roles) with safe profile fields.
 *   Requires administrator role. Handles unapplied migration 0033 gracefully.
 *
 * POST /api/moderation/staff
 *   Appoint a new staff member. Administrator only.
 *   Body: { targetUserId, role, reason }
 *   - Rejects duplicate assignments, non-existent users, invalid roles.
 *   - Prevents unnecessary self-assignment.
 *   - Records audit log (appointment).
 *
 * PATCH /api/moderation/staff
 *   Change role or remove staff member. Administrator only.
 *   Body: { targetUserId, role?, reason?, action?: "remove" }
 *   - Records audit log with before/after state.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireModeratorRole, recordModerationAction } from "@/lib/moderation";

type SupabaseLikeError = { code?: string; message?: string; details?: string; hint?: string } | null | undefined;

const MIGRATION_REQUIRED_MESSAGE =
  "Staff management database setup is incomplete. Apply migration 0033_moderator_administration.sql (and pending moderation migrations) to the target database. Migrations must not be applied to production automatically.";

function isMissingRelationError(error: SupabaseLikeError): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204") return true;
  const hay = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.toLowerCase();
  return (hay.includes("does not exist") && (hay.includes("relation") || hay.includes("table") || hay.includes("schema cache") || hay.includes("column"))) || hay.includes("could not find the table");
}

function safeDbError(error: SupabaseLikeError, fallback: { error: string; status: number }) {
  if (isMissingRelationError(error)) {
    return NextResponse.json({ error: "migration_required", code: "migration_required", message: MIGRATION_REQUIRED_MESSAGE }, { status: 503 });
  }
  return NextResponse.json({ error: fallback.error }, { status: fallback.status });
}

function badRequest(message: string) {
  return NextResponse.json({ error: "bad_request", message }, { status: 400 });
}

const VALID_ROLES = ["moderator", "senior_moderator", "administrator"] as const;
type StaffRole = (typeof VALID_ROLES)[number];

function isValidRole(role: unknown): role is StaffRole {
  return typeof role === "string" && (VALID_ROLES as readonly string[]).includes(role);
}

export async function GET(request: Request) {
  try {
    const ctx = await requireModeratorRole("administrator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const url = new URL(request.url);
    const roleFilter = url.searchParams.get("role") || undefined;
    const search = (url.searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)));
    const offset = (page - 1) * pageSize;

    // Resolve search to user IDs via profiles (safe fields only). Avoid fragile
    // joined-relation ilike filters that can fail across PostgREST setups.
    let searchUserIds: string[] | null = null;
    if (search) {
      const { data: profs, error: profErr } = await supabase
        .from("profiles")
        .select("id")
        .or(`username.ilike.%${search.replace(/[%(),]/g, "")}%,display_name.ilike.%${search.replace(/[%(),]/g, "")}%`)
        .limit(100);
      if (profErr) return safeDbError(profErr, { error: "failed_to_load_staff", status: 500 });
      searchUserIds = (profs ?? []).map((p: any) => p.id).filter(Boolean);
      if (searchUserIds.length === 0) {
        return NextResponse.json({ staff: [], page, pageSize, total: 0, actor: { userId: ctx.userId, isAdministrator: ctx.isAdministrator } });
      }
    }

    let q = supabase
      .from("moderator_roles")
      .select("id, user_id, role, assigned_by, assigned_at, reason", { count: "exact" })
      .order("assigned_at", { ascending: false });

    if (roleFilter && isValidRole(roleFilter)) q = q.eq("role", roleFilter);
    if (searchUserIds) q = q.in("user_id", searchUserIds);
    q = q.range(offset, offset + pageSize - 1);

    const { data, error, count } = await q;
    if (error) return safeDbError(error, { error: "failed_to_load_staff", status: 500 });

    const rows = (data ?? []) as any[];
    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
    const { data: profiles, error: profileErr } = userIds.length
      ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", userIds)
      : { data: [] as any[], error: null as SupabaseLikeError };
    if (profileErr) return safeDbError(profileErr, { error: "failed_to_load_staff", status: 500 });
    const profileMap = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p]));

    const staff = rows.map((row) => {
      const profile = profileMap.get(row.user_id);
      return {
        id: row.id,
        userId: row.user_id,
        username: profile?.username ?? null,
        displayName: profile?.display_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
        role: row.role,
        assignedBy: row.assigned_by ?? null,
        assignedAt: row.assigned_at ?? null,
        reason: row.reason ?? null,
        status: "active",
      };
    });

    return NextResponse.json({
      staff,
      page,
      pageSize,
      total: count ?? 0,
      actor: { userId: ctx.userId, isAdministrator: ctx.isAdministrator },
    });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err?.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireModeratorRole("administrator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { targetUserId, role, reason } = body as { targetUserId?: string; role?: string; reason?: string };

    if (!targetUserId || typeof targetUserId !== "string") return badRequest("targetUserId is required.");
    if (!isValidRole(role)) return badRequest("Invalid role.");
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) return badRequest("Reason is required.");
    if (reason.trim().length > 500) return badRequest("Reason is too long.");

    // Prevent unnecessary self-assignment.
    if (targetUserId === ctx.userId) {
      return NextResponse.json({ error: "cannot_assign_self", message: "You cannot assign a staff role to your own account." }, { status: 400 });
    }

    // Acting user is verified administrator (server-side). Keep an explicit guard.
    if (role === "administrator" && !ctx.isAdministrator) {
      return NextResponse.json({ error: "forbidden", message: "Only administrators can appoint administrators." }, { status: 403 });
    }

    // Verify target user exists (safe server-side lookup).
    const { data: targetProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", targetUserId)
      .maybeSingle();
    if (profileError) return safeDbError(profileError, { error: "failed_to_assign_staff", status: 500 });
    if (!targetProfile) return NextResponse.json({ error: "user_not_found", message: "Target account was not found." }, { status: 404 });

    // Reject duplicate assignments.
    const { data: existing, error: existingErr } = await supabase
      .from("moderator_roles")
      .select("id, role")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existingErr) return safeDbError(existingErr, { error: "failed_to_assign_staff", status: 500 });
    if (existing) {
      return NextResponse.json({ error: "duplicate_assignment", message: "This account already has a staff role. Use Change role instead." }, { status: 409 });
    }

    const payload = {
      user_id: targetUserId,
      role,
      assigned_by: ctx.userId!,
      assigned_at: new Date().toISOString(),
      reason: reason.trim(),
    };
    const { data: roleRow, error: roleError } = await supabase
      .from("moderator_roles")
      .insert(payload)
      .select("id, user_id, role, assigned_by, assigned_at, reason")
      .single();
    if (roleError) {
      // Handle race-condition unique violation as duplicate.
      if ((roleError as any).code === "23505") {
        return NextResponse.json({ error: "duplicate_assignment", message: "This account already has a staff role." }, { status: 409 });
      }
      return safeDbError(roleError, { error: "failed_to_assign_staff", status: 400 });
    }

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "staff_role",
      targetId: targetUserId,
      action: "assign_staff_role",
      details: { role, reason: reason.trim(), target_username: (targetProfile as any).username ?? null },
      afterState: { role, assigned_at: (roleRow as any).assigned_at ?? null },
    });

    return NextResponse.json({ ok: true, staff: roleRow }, { status: 201 });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err?.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await requireModeratorRole("administrator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { targetUserId, role, reason, action } = body as { targetUserId?: string; role?: string; reason?: string; action?: string };

    if (!targetUserId || typeof targetUserId !== "string") return badRequest("targetUserId is required.");
    if (targetUserId === ctx.userId) {
      return NextResponse.json({ error: "cannot_modify_self", message: "You cannot change or remove your own staff role from this panel." }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await supabase
      .from("moderator_roles")
      .select("id, user_id, role, reason, assigned_at")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (existingErr) return safeDbError(existingErr, { error: "failed_to_update_staff", status: 500 });
    if (!existing) return NextResponse.json({ error: "staff_not_found", message: "Staff role not found for this account." }, { status: 404 });

    const isRemove = action === "remove" || role === null || typeof role === "undefined";
    if (isRemove) {
      const { error: deleteError } = await supabase.from("moderator_roles").delete().eq("user_id", targetUserId);
      if (deleteError) return safeDbError(deleteError, { error: "failed_to_remove_staff", status: 400 });

      await recordModerationAction({
        actorId: ctx.userId!,
        targetType: "staff_role",
        targetId: targetUserId,
        action: "remove_staff_role",
        details: { reason: typeof reason === "string" ? reason.trim() || null : null },
        beforeState: { role: (existing as any).role },
        afterState: { role: null },
      });
      return NextResponse.json({ ok: true });
    }

    if (!isValidRole(role)) return badRequest("Invalid role.");
    if (role === "administrator" && !ctx.isAdministrator) {
      return NextResponse.json({ error: "forbidden", message: "Only administrators can appoint administrators." }, { status: 403 });
    }
    if (typeof reason !== "string" || reason.trim().length === 0) return badRequest("Reason is required for role changes.");
    if ((existing as any).role === role) {
      return NextResponse.json({ error: "no_change", message: "This account already has that role." }, { status: 400 });
    }

    const { data: roleRow, error: roleError } = await supabase
      .from("moderator_roles")
      .update({ role, assigned_by: ctx.userId!, assigned_at: new Date().toISOString(), reason: reason.trim() })
      .eq("user_id", targetUserId)
      .select("id, user_id, role, assigned_by, assigned_at, reason")
      .single();
    if (roleError) return safeDbError(roleError, { error: "failed_to_update_staff", status: 400 });

    await recordModerationAction({
      actorId: ctx.userId!,
      targetType: "staff_role",
      targetId: targetUserId,
      action: "update_staff_role",
      details: { from_role: (existing as any).role, to_role: role, reason: reason.trim() },
      beforeState: { role: (existing as any).role },
      afterState: { role },
    });

    return NextResponse.json({ ok: true, staff: roleRow });
  } catch (err: any) {
    if (err?.status === 401) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (err?.status === 403) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
