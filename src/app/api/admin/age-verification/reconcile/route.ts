import { NextRequest, NextResponse } from "next/server";
import { requireModeratorRole } from "@/lib/moderation";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/age-verification/reconcile
 *   Reconcile legacy `access_age_verified` badge assignments into
 *   `profiles.age_verified`. Administrator only.
 *
 *   This is the auditable reconciliation path for accounts whose age was
 *   verified through the platform's existing trusted process (recorded as the
 *   `access_age_verified` staff badge) but whose `profiles.age_verified` flag
 *   was never set. It does NOT fabricate verification: it only recognises an
 *   existing, independently-granted badge, and every change is written to
 *   `moderation_audit_log` by the server-side RPC.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireModeratorRole("administrator", request);
    const supabase = createServerClient();
    if (!supabase) return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });

    const rl = await rateLimit(getRateLimitKey({ userId: ctx.userId ?? undefined, ip: getClientIp(request) }), "/api/admin/age-verification/reconcile", 10, 60);
    if (!rl.allowed) return rl.response!;

    if (!ctx.userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("reconcile_age_verified_badges", { p_actor_id: ctx.userId });

    if (error) {
      return NextResponse.json({ error: "Reconciliation failed.", detail: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      reconciled: Array.isArray(data) ? data : [],
      count: Array.isArray(data) ? data.length : 0,
      actor: { userId: ctx.userId, isAdministrator: ctx.isAdministrator },
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    const status = typeof err?.status === "number" ? err.status : 500;
    return NextResponse.json({ error: err?.message ?? "Internal server error." }, { status });
  }
}