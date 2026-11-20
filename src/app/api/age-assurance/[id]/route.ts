import { NextRequest, NextResponse } from "next/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { decideAgeAssuranceRequest } from "@/lib/ageVerification";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/age-assurance/[id]
 *   Approve or reject an age-assurance request. Moderator+ only.
 *   Body: { decision: "approved" | "rejected", reviewNote?: string, evidence?: object }
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireModeratorRole("moderator", request);
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "Request id is required." }, { status: 400 });

    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId ?? undefined, ip: getClientIp(request) }), "/api/age-assurance", 30, 60);
    if (!rl.allowed) return rl.response!;

    let body: any = {};
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const decision = body?.decision;
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision must be 'approved' or 'rejected'." }, { status: 400 });
    }
    const reviewNote = typeof body?.reviewNote === "string" ? body.reviewNote : null;
    let evidence: Record<string, unknown> | null = null;
    if (body?.evidence && typeof body.evidence === "object" && !Array.isArray(body.evidence)) {
      evidence = body.evidence as Record<string, unknown>;
    }

    if (!ctx.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const result = await decideAgeAssuranceRequest(id, ctx.userId, decision, reviewNote, evidence);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ request: result.request, profileUpdated: result.profileUpdated });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return NextResponse.json({ error: err?.message ?? "Internal server error." }, { status });
  }
}