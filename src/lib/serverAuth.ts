import { createServerClient } from "@/lib/supabase/server";

export type VerifiedAuthUser = {
  id: string;
  email?: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export type RequestAuthResult =
  | { ok: true; mode: "bearer" | "session"; user: VerifiedAuthUser }
  | { ok: false; mode: "anonymous"; reason: "no_bearer" }
  | { ok: false; mode: "bearer"; reason: "invalid_bearer" | "verification_unavailable"; errorName?: string; errorStatus?: number; errorCode?: string };

function safeDiagEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AF_MOD_DIAG === "1";
}

function diag(event: string, fields: Record<string, unknown>) {
  if (!safeDiagEnabled()) return;
  try {
    console.info(`[mod-auth] ${event}`, fields);
  } catch {}
}

export function getBearerToken(request?: Request | null): string | null {
  try {
    const h = request?.headers?.get?.("authorization") ?? request?.headers?.get?.("Authorization");
    if (!h) return null;
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    const token = m?.[1]?.trim();
    return token ? token : null;
  } catch {
    return null;
  }
}

function decodeJwtPayloadUnsafe(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function configuredSupabaseProjectRef(): string | null {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!url) return null;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return m?.[1] || host;
  } catch {
    return null;
  }
}

function extractProjectRefFromIss(iss: unknown): string | null {
  if (typeof iss !== "string" || !iss) return null;
  try {
    const u = new URL(iss);
    const host = u.hostname.toLowerCase();
    const m = /^([a-z0-9-]+)\.supabase\.co$/i.exec(host);
    return m?.[1] || host;
  } catch {
    return null;
  }
}

function extractErrorCode(error: any): string | undefined {
  const code = error?.code ?? error?.error_code ?? error?.errorCode;
  return typeof code === "string" && code ? code : undefined;
}

function isVerificationUnavailable(error: any): boolean {
  const status = typeof error?.status === "number" ? error.status : undefined;
  const name = typeof error?.name === "string" ? error.name : "";
  const msg = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (status && status >= 500) return true;
  if (name === "AuthRetryableFetchError" || name === "FetchError" || name === "TypeError") return true;
  if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("econn") || msg.includes("timeout")) return true;
  return false;
}

function jwtDiag(token: string, error: any, extra?: Record<string, unknown>) {
  const payload = decodeJwtPayloadUnsafe(token);
  const exp = typeof payload?.exp === "number" ? payload.exp : undefined;
  const now = Math.floor(Date.now() / 1000);
  const cfg = configuredSupabaseProjectRef();
  const issRef = extractProjectRefFromIss(payload?.iss);
  const status = typeof error?.status === "number" ? error.status : (typeof error?.code === "number" ? error.code : undefined);
  return {
    hasBearer: true,
    hasError: Boolean(error),
    errorName: typeof error?.name === "string" ? error.name : (typeof error?.__isAuthError === "boolean" && error.__isAuthError ? "AuthError" : undefined),
    errorStatus: status,
    errorCode: extractErrorCode(error),
    tokenExpired: typeof exp === "number" ? exp <= now : undefined,
    expUnix: exp,
    issPresent: typeof payload?.iss === "string" && payload.iss.length > 0,
    issMatchesConfiguredProject: cfg && issRef ? cfg === issRef : (cfg || issRef ? false : null),
    audPresent: typeof payload?.aud === "string" ? payload.aud.length > 0 : Array.isArray(payload?.aud),
    subPresent: typeof payload?.sub === "string" && payload.sub.length > 0,
    ...extra,
  };
}

function toVerifiedUser(dataUser: any): VerifiedAuthUser {
  const appMeta = (dataUser?.app_metadata ?? {}) as Record<string, unknown>;
  return {
    id: String(dataUser.id),
    email: dataUser.email ?? null,
    app_metadata: appMeta,
    user_metadata: (dataUser?.user_metadata ?? {}) as Record<string, unknown>,
  };
}

export async function verifyRequestAuth(request?: Request | null): Promise<RequestAuthResult> {
  const supabase = createServerClient();
  const jwt = getBearerToken(request);
  const supabaseJsVersion = process.env.npm_package_dependencies__supabase_supabase_js || undefined;
  const authJsVersion = "2.65.0"; // installed dependency (see package-lock); safe static metadata
  const baseDiag = {
    verificationOperation: "supabase.auth.getUser(jwt)" as const,
    jwtArgumentSupplied: Boolean(jwt),
    serverClientConfigured: Boolean(supabase),
    supabaseJsVersion,
    authJsVersion,
  };

  if (!supabase) {
    diag("no_server_client", { ...baseDiag, hasBearer: Boolean(jwt) });
    if (jwt) return { ok: false, mode: "bearer", reason: "verification_unavailable", errorName: "ServerClientMissing" };
    return { ok: false, mode: "anonymous", reason: "no_bearer" };
  }

  if (jwt) {
    try {
      // Explicit JWT verification against configured Supabase project. Never trust decoded claims without this call.
      const { data, error } = await (supabase as any).auth.getUser(jwt);
      if (error || !data?.user) {
        const unavailable = isVerificationUnavailable(error);
        diag(unavailable ? "bearer_verify_unavailable" : "bearer_verify_failed", jwtDiag(jwt, error, baseDiag));
        return {
          ok: false,
          mode: "bearer",
          reason: unavailable ? "verification_unavailable" : "invalid_bearer",
          errorName: typeof error?.name === "string" ? error.name : undefined,
          errorStatus: typeof error?.status === "number" ? error.status : undefined,
          errorCode: extractErrorCode(error),
        };
      }
      const user = toVerifiedUser(data.user);
      diag("bearer_verified", {
        ...baseDiag,
        hasBearer: true,
        userResolved: true,
        hasAdminClaim: user.app_metadata.afterfur_staff_admin === true || user.app_metadata.afterfur_staff_admin === "true",
      });
      return { ok: true, mode: "bearer", user };
    } catch (error) {
      const unavailable = isVerificationUnavailable(error);
      diag(unavailable ? "bearer_verify_exception_unavailable" : "bearer_verify_exception", jwtDiag(jwt, error, baseDiag));
      return {
        ok: false,
        mode: "bearer",
        reason: unavailable ? "verification_unavailable" : "invalid_bearer",
        errorName: typeof (error as any)?.name === "string" ? (error as any).name : undefined,
        errorStatus: typeof (error as any)?.status === "number" ? (error as any).status : undefined,
        errorCode: extractErrorCode(error),
      };
    }
  }

  // No Bearer token supplied: truly anonymous request for bearer-based API auth.
  // Compatibility fallback: some server-side contexts/tests may attach a session to the
  // Supabase client; only attempt when no bearer was presented. Never use this fallback
  // for requests that supplied a bearer (invalid bearer must not become authenticated/anonymous fallback).
  try {
    const { data, error } = await (supabase as any).auth.getUser();
    if (!error && data?.user) {
      const user = toVerifiedUser(data.user);
      diag("session_verified_no_bearer", {
        ...baseDiag,
        hasBearer: false,
        userResolved: true,
        hasAdminClaim: user.app_metadata.afterfur_staff_admin === true || user.app_metadata.afterfur_staff_admin === "true",
      });
      return { ok: true, mode: "session", user };
    }
  } catch {
    // fall through to anonymous
  }
  diag("no_bearer_anonymous", { ...baseDiag, hasBearer: false, userResolved: false });
  return { ok: false, mode: "anonymous", reason: "no_bearer" };
}

/**
 * Compatibility helper: returns verified user or null.
 * IMPORTANT: null means "not verified" (anonymous OR invalid/unavailable bearer).
 * Routes that must distinguish invalid bearer from anonymous must use verifyRequestAuth().
 */
export async function getVerifiedUser(request?: Request | null): Promise<VerifiedAuthUser | null> {
  const result = await verifyRequestAuth(request);
  return result.ok ? result.user : null;
}
