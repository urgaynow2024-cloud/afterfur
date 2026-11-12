/**
 * Database-backed rate limiting for Next.js API routes.
 * Phase 5.3 hardened.
 * Phase 5.4: Added structured diagnostic logging for 429 incident investigation.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export type RateLimitResult = {
  allowed: boolean;
  response?: Response;
};

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function isVitest(): boolean {
  return process.env.VITEST === "true" || Boolean((process.env as any).VITEST_WORKER_ID);
}

function allowUnconfiguredBypass(): boolean {
  if (isProduction()) return false;
  if (process.env.RATE_LIMIT_ALLOW_UNCONFIGURED === "true") return true;
  if ((process.env.NODE_ENV === "test" || isVitest()) && process.env.RATE_LIMIT_ENFORCE_IN_TESTS !== "true") return true;
  return false;
}

function safeDiagEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AF_RATE_LIMIT_DIAG === "1";
}

function diag(event: string, fields: Record<string, unknown>) {
  if (!safeDiagEnabled()) return;
  try {
    console.info(`[rate-limit] ${event}`, fields);
  } catch {}
}

function deny(status: number, error: string, message: string): RateLimitResult {
  return {
    allowed: false,
    response: NextResponse.json({ error, message }, { status }),
  };
}

export async function rateLimit(
  identifier: string,
  endpoint: string,
  limit: number,
  windowSeconds: number,
  correlationId?: string
): Promise<RateLimitResult> {
  const diagBase = {
    correlationId,
    endpoint,
    method: "GET",
    limit,
    windowSeconds,
    identifierCategory: identifier.startsWith("user:") ? "user" : identifier.startsWith("ip:") ? "ip" : "other",
    hasIdentifier: Boolean(identifier),
  };

  if (!identifier || typeof identifier !== "string") {
    diag("deny_empty_identifier", { ...diagBase, reason: "empty_identifier" });
    return deny(429, "rate_limited", "Too many requests. Please try again later.");
  }

  if (limit <= 0) {
    diag("deny_invalid_limit", { ...diagBase, reason: "limit_lte_zero", isProduction: isProduction() });
    if (isProduction()) {
      return deny(503, "rate_limit_misconfigured", "Service temporarily unavailable.");
    }
    return { allowed: true };
  }

  if ((process.env.NODE_ENV === "test" || isVitest()) && process.env.RATE_LIMIT_ENFORCE_IN_TESTS !== "true") {
    diag("bypass_test_mode", { ...diagBase, reason: "test_mode_bypass" });
    return { allowed: true };
  }

  const supabase = createServerClient();
  if (!supabase) {
    diag("deny_no_supabase", { ...diagBase, reason: "no_supabase_client", allowUnconfiguredBypass: allowUnconfiguredBypass() });
    if (allowUnconfiguredBypass()) return { allowed: true };
    return deny(503, "rate_limit_unavailable", "Service temporarily unavailable.");
  }

  try {
    const { data: allowed, error } = await (supabase as any).rpc("check_rate_limit", {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      diag("rpc_error", { ...diagBase, rpcError: error?.message ?? "unknown", rpcErrorCode: error?.code ?? null, allowed: false });
      return deny(503, "rate_limit_unavailable", "Rate verification temporarily unavailable. Please try again shortly.");
    }

    if (allowed !== true) {
      diag("rpc_denied", { ...diagBase, rpcAllowed: allowed, allowed: false });
      return deny(429, "rate_limited", "Too many requests. Please try again later.");
    }

    diag("allowed", { ...diagBase, rpcAllowed: allowed, allowed: true });
  } catch (err) {
    diag("rpc_exception", { ...diagBase, error: err instanceof Error ? err.message : "unknown", allowed: false });
    return deny(503, "rate_limit_unavailable", "Rate verification temporarily unavailable. Please try again shortly.");
  }

  return { allowed: true };
}

export function getClientIp(request: Request): string {
  try {
    const h = request.headers;
    const xff = h.get("x-forwarded-for") || h.get("X-Forwarded-For");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first.slice(0, 128);
    }
    const real = h.get("x-real-ip") || h.get("X-Real-IP");
    if (real && real.trim()) return real.trim().slice(0, 128);
    const cf = h.get("cf-connecting-ip") || h.get("CF-Connecting-IP");
    if (cf && cf.trim()) return cf.trim().slice(0, 128);
  } catch {
    // ignore
  }
  return "ip:unknown";
}

export function getRateLimitKey(opts: { userId?: string | null; ip?: string | null }): string {
  const uid = typeof opts.userId === "string" ? opts.userId.trim() : "";
  if (uid) return `user:${uid}`;
  const ip = typeof opts.ip === "string" ? opts.ip.trim() : "";
  return `ip:${ip || "unknown"}`;
}
