import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/lib/serverAuth";
import { requireModeratorRole, getModeratorContext } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import {
  submitAgeVerificationRequest,
  listAgeVerificationRequests,
} from "@/lib/ageVerification";

export const dynamic = "force-dynamic";

/**
 * POST /api/age-verification
 *   Submit an age-verification request for the authenticated user.
 *   Body: { evidence?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const userId = auth.user.id;

    const rl = await rateLimit(getRateLimitKey({ userId, ip: getClientIp(request) }), "/api/age-verification", 30, 60);
    if (!rl.allowed) return rl.response!;

    let evidence: Record<string, unknown> | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.evidence === "object" && !Array.isArray(body.evidence)) {
        evidence = body.evidence as Record<string, unknown>;
      }
    } catch {
      // No body is acceptable.
    }

    const result = await submitAgeVerificationRequest(userId, evidence);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}

/**
 * GET /api/age-verification?status=pending
 *   List age-verification requests. Staff see all; users see their own.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const userId = auth.user.id;

    const rl = await rateLimit(getRateLimitKey({ userId, ip: getClientIp(request) }), "/api/age-verification", 60, 60);
    if (!rl.allowed) return rl.response!;

    const ctx = await getModeratorContext(request);
    const rawStatus = new URL(request.url).searchParams.get("status");
    const status = rawStatus === "pending" || rawStatus === "approved" || rawStatus === "rejected" ? (rawStatus as "pending" | "approved" | "rejected") : undefined;

    const requests = await listAgeVerificationRequests(userId, ctx.canModerate, status);
    return NextResponse.json({ requests });
  } catch {
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}