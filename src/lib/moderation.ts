/**
 * Moderator & administration permission helpers.
 *
 * Role hierarchy (lowest to highest):
 *   moderator       - view/resolve reports, basic content moderation
 *   senior_moderator - everything moderator can do + user enforcement
 *   administrator   - everything + staff management, system config
 *
 * TRUSTED ADMIN CLAIM (backward compatible with existing staff system):
 *   `afterfur_staff_admin: true` in Supabase Auth **app_metadata** (verified by
 *   Supabase Auth via getUser/getUser(jwt)) implicitly grants administrator-level
 *   access. app_metadata is server-controlled (not user-editable). NEVER trust
 *   user_metadata for privileges.
 */

import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser, type VerifiedAuthUser } from "@/lib/serverAuth";
import type { Json } from "@/lib/supabase/database.types";

export type ModeratorRole = "moderator" | "senior_moderator" | "administrator";

export const MODERATOR_ROLE_HIERARCHY: Record<ModeratorRole, number> = {
  moderator: 10,
  senior_moderator: 20,
  administrator: 30,
};

export function roleLevel(role: ModeratorRole | null): number {
  return role ? MODERATOR_ROLE_HIERARCHY[role] : 0;
}

export function hasRoleAtLeast(
  userRole: ModeratorRole | null,
  minRole: ModeratorRole,
): boolean {
  return roleLevel(userRole) >= roleLevel(minRole);
}

export function isTrustedStaffAdmin(appMetadata: Record<string, unknown> | null | undefined): boolean {
  // Only trusted app_metadata (verified by Supabase Auth). Accept boolean true or
  // legacy string "true" for compatibility. Do NOT read user_metadata.
  return appMetadata?.afterfur_staff_admin === true || appMetadata?.afterfur_staff_admin === "true";
}

export type ModeratorContext = {
  userId: string | null;
  role: ModeratorRole | null;
  isAdministrator: boolean;
  canModerate: boolean;
  canManageUsers: boolean;
  canManageStaff: boolean;
  appMetadata: Record<string, unknown> | null;
};

function emptyContext(): ModeratorContext {
  return {
    userId: null,
    role: null,
    isAdministrator: false,
    canModerate: false,
    canManageUsers: false,
    canManageStaff: false,
    appMetadata: null,
  };
}

function contextFromVerifiedUser(user: VerifiedAuthUser, role: ModeratorRole | null): ModeratorContext {
  const canModerate = hasRoleAtLeast(role, "moderator");
  const canManageUsers = hasRoleAtLeast(role, "senior_moderator");
  const canManageStaff = hasRoleAtLeast(role, "administrator");
  return {
    userId: user.id,
    role,
    isAdministrator: role === "administrator",
    canModerate,
    canManageUsers,
    canManageStaff,
    appMetadata: user.app_metadata ?? null,
  };
}

/**
 * Determine moderator context for the current authenticated user.
 * Resolves user from trusted request auth (Bearer JWT verified by Supabase) when
 * request is provided; falls back to verified client auth for compatibility.
 * Administrator access is granted ONLY via trusted app_metadata.afterfur_staff_admin
 * or moderator_roles rows — never via user_metadata.
 */
export async function getModeratorContext(request?: Request | null): Promise<ModeratorContext> {
  const supabase = createServerClient();
  if (!supabase) return emptyContext();

  const user = await getVerifiedUser(request);
  if (!user?.id) return emptyContext();

  if (isTrustedStaffAdmin(user.app_metadata)) {
    return contextFromVerifiedUser(user, "administrator");
  }

  // Query moderator_roles for granular role. Service client is used for privileged
  // read; authorization decision is still based on verified user identity above.
  try {
    const { data: roleRow, error: roleError } = await supabase
      .from("moderator_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!roleError && roleRow && typeof (roleRow as any).role === "string") {
      const r = (roleRow as any).role as ModeratorRole;
      if (r === "moderator" || r === "senior_moderator" || r === "administrator") {
        return contextFromVerifiedUser(user, r);
      }
    }
  } catch {
    // Missing migration/table or transient DB issue: deny role elevation.
  }

  return contextFromVerifiedUser(user, null);
}

/**
 * Require at least the given moderator role for the verified authenticated user.
 */
export async function requireModeratorRole(minRole: ModeratorRole, request?: Request | null): Promise<ModeratorContext> {
  const ctx = await getModeratorContext(request);
  if (!ctx.userId) {
    if (process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1") {
      try { console.info("[mod-auth] require_role_denied", { minRole, status: 401, resolvedRole: ctx.role, isAdministrator: ctx.isAdministrator }); } catch {}
    }
    const err: any = new Error("Authentication required.");
    err.status = 401;
    throw err;
  }
  if (!hasRoleAtLeast(ctx.role, minRole)) {
    if (process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1") {
      try { console.info("[mod-auth] require_role_denied", { minRole, status: 403, resolvedRole: ctx.role, isAdministrator: ctx.isAdministrator }); } catch {}
    }
    const err: any = new Error("Insufficient moderator permissions.");
    err.status = 403;
    throw err;
  }
  if (process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1") {
    try { console.info("[mod-auth] require_role_ok", { minRole, resolvedRole: ctx.role, isAdministrator: ctx.isAdministrator }); } catch {}
  }
  return ctx;
}

/**
 * Record a moderation action in the audit log (security-definer RPC).
 */
export async function recordModerationAction(opts: {
  actorId: string;
  targetType: "post" | "reply" | "user" | "report" | "appeal" | "staff_role";
  targetId: string;
  action: string;
  details?: Record<string, unknown> | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
}): Promise<{ id: string | null; error: string | null }> {
  const supabase = createServerClient();
  if (!supabase) return { id: null, error: "Supabase not configured." };

  const { data, error } = await supabase.rpc("record_moderation_action", {
    p_actor_id: opts.actorId,
    p_target_type: opts.targetType,
    p_target_id: opts.targetId,
    p_action: opts.action,
    p_details: (opts.details ?? null) as Json | null,
    p_before_state: (opts.beforeState ?? null) as Json | null,
    p_after_state: (opts.afterState ?? null) as Json | null,
  });

  if (error) return { id: null, error: "Failed to record moderation action." };
  return { id: data ? String(data) : null, error: null };
}

