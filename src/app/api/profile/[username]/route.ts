import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { verifyRequestAuth } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { getProfileForViewer } from "@/lib/profiles.server";

function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeDiagEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.AF_RATE_LIMIT_DIAG === "1";
}

function diag(event: string, fields: Record<string, unknown>) {
  if (!safeDiagEnabled()) return;
  try {
    console.info(`[profile-api] ${event}`, fields);
  } catch {}
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const correlationId = generateCorrelationId();
  try {
    const { username } = await params;
    const auth = await verifyRequestAuth(request);

    diag("auth_result", {
      correlationId,
      route: "/api/profile/[username]",
      method: "GET",
      authMode: auth.mode,
      authOk: auth.ok,
      authReason: auth.ok ? null : auth.reason,
      hasVerifiedUserId: auth.ok ? true : false,
      verifiedUserId: auth.ok ? auth.user.id : null,
    });

    // A presented Bearer token must be explicitly verified. Never silently downgrade
    // invalid/unverifiable bearer requests to anonymous access or anonymous rate-limit context.
    if (auth.mode === "bearer" && !auth.ok) {
      diag("early_return_invalid_bearer", {
        correlationId,
        route: "/api/profile/[username]",
        method: "GET",
        authReason: auth.reason,
        authErrorName: auth.errorName ?? null,
        authErrorCode: auth.errorCode ?? null,
      });
      if (auth.reason === "verification_unavailable") {
        return NextResponse.json({ error: "auth_verification_unavailable", reason: auth.reason, authError: auth.errorName ?? null, authCode: auth.errorCode ?? null, message: "Authentication verification temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ error: "unauthorized", reason: auth.reason, authError: auth.errorName ?? null, authCode: auth.errorCode ?? null, message: "Invalid or expired authentication token." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const viewerId = auth.ok ? auth.user.id : null;
    const clientIp = getClientIp(request);
    const rateLimitKey = getRateLimitKey({ userId: viewerId, ip: clientIp });

    diag("rate_limit_check", {
      correlationId,
      route: "/api/profile/[username]",
      method: "GET",
      viewerId,
      clientIpCategory: clientIp === "ip:unknown" ? "unknown" : "known",
      rateLimitKeyCategory: rateLimitKey.startsWith("user:") ? "user" : "ip",
      rateLimitKeyPrefix: rateLimitKey.split(":")[0],
      limit: 180,
      windowSeconds: 60,
    });

    // Read-only profile lookups: higher limit to avoid 429 during normal navigation/render.
    // Abuse protection remains via authenticated/IP keying and fail-closed production behavior.
    const rl = await rateLimit(rateLimitKey, "/api/profile/[username]", 180, 60, correlationId);
    if (!rl.allowed) {
      diag("rate_limited_response", {
        correlationId,
        route: "/api/profile/[username]",
        method: "GET",
        viewerId,
        rateLimitKeyCategory: rateLimitKey.startsWith("user:") ? "user" : "ip",
      });
      return rl.response;
    }

    const supabase = createServerClient();
    if (!supabase) {
      if (viewerId) return NextResponse.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const result = await getProfileForViewer({ username, viewerId });
    if (result.error === "forbidden") {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
    if (result.error === "no-server-client") {
      return NextResponse.json({ error: "internal_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    if (!result.profile) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "private, max-age=15" } });
    }
    return NextResponse.json({ profile: result.profile }, {
      headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=60" },
    });
  } catch (err) {
    diag("unhandled_exception", {
      correlationId,
      route: "/api/profile/[username]",
      method: "GET",
      error: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}