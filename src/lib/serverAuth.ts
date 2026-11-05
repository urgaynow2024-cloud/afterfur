/**
 * Server-side request authentication helpers.
 *
 * Resolves the authenticated Supabase user from TRUSTED sources only:
 * - Authorization: Bearer <access_token> header, verified via Supabase Auth
 *   (auth.getUser(jwt)). This validates the JWT signature/expiry with Supabase
 *   and returns trusted user fields including app_metadata.
 *
 * SECURITY:
 * - NEVER log tokens, secrets, or raw Authorization headers.
 * - NEVER trust user_metadata for privileges (user-editable).
 * - Only app_metadata claims verified by Supabase Auth are trusted for roles.
 * - Do not expose credentials or raw auth errors to clients.
 */
import { createServerClient } from "@/lib/supabase/server";

export type VerifiedAuthUser = {
  id: string;
  email?: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

function safeDiagEnabled(): boolean {
  // Safe diagnostics are opt-in in production to avoid log noise; always useful
  // in development. Never logs secrets/tokens.
  return process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1";
}

function diag(event: string, fields: Record<string, unknown>) {
  if (!safeDiagEnabled()) return;
  try {
    console.info(`[mod-auth] ${event}`, fields);
  } catch {}
}

function getBearerToken(request?: Request | null): string | null {
  try {
    const h = request?.headers?.get?.("authorization") ?? request?.headers?.get?.("Authorization");
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    return m?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export async function getVerifiedUser(request?: Request | null): Promise<VerifiedAuthUser | null> {
  const supabase = createServerClient();
  if (!supabase) {
    diag("no_server_client", {});
    return null;
  }

  const jwt = getBearerToken(request);
  if (jwt) {
    try {
      // Verify JWT with Supabase Auth; returns trusted user (incl. app_metadata).
      const { data, error } = await (supabase as any).auth.getUser(jwt);
      if (error || !data?.user) {
        diag("bearer_verify_failed", { hasBearer: true, hasError: Boolean(error) });
        return null;
      }
      const appMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
      diag("bearer_verified", {
        hasBearer: true,
        userResolved: true,
        hasAdminClaim: appMeta.afterfur_staff_admin === true || appMeta.afterfur_staff_admin === "true",
      });
      return {
        id: String(data.user.id),
        email: data.user.email ?? null,
        app_metadata: appMeta,
        user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
      };
    } catch {
      diag("bearer_verify_exception", { hasBearer: true });
      return null;
    }
  }

  // Fallback: some environments may attach a session to the client (non-service
  // or test mocks). Do not assume cookie session exists on service-role client.
  try {
    const { data, error } = await (supabase as any).auth.getUser();
    if (error || !data?.user) {
      diag("no_bearer_unverified", { hasBearer: false, userResolved: false });
      return null;
    }
    const appMeta = (data.user.app_metadata ?? {}) as Record<string, unknown>;
    diag("fallback_verified", {
      hasBearer: false,
      userResolved: true,
      hasAdminClaim: appMeta.afterfur_staff_admin === true || appMeta.afterfur_staff_admin === "true",
    });
    return {
      id: String(data.user.id),
      email: data.user.email ?? null,
      app_metadata: appMeta,
      user_metadata: (data.user.user_metadata ?? {}) as Record<string, unknown>,
    };
  } catch {
    diag("fallback_exception", { hasBearer: false });
    return null;
  }
}
