import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/serverAuth";
import { rateLimit, getClientIp, getRateLimitKey } from "@/lib/rateLimit";
import { getAfterDarkEligibility } from "@/lib/afterDark";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await getVerifiedUser(request);
    const viewerId = user?.id ?? null;

    const rl = await rateLimit(getRateLimitKey({ userId: viewerId, ip: getClientIp(request) }), "/api/after-dark/eligibility", 120, 60);
    if (!rl.allowed) return rl.response!;

    // Ops kill-switch: explicitly disabling After Dark for everyone takes
    // precedence over per-user eligibility. Unset or "true" leaves access to
    // the server-side eligibility check below (no bypass).
    if (process.env.AFTER_DARK_ENABLED === "false") {
      return NextResponse.json({ eligible: false, ageVerified: false, assuranceApproved: false, reason: "disabled" }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const supabase = createServerClient();
    const eligibility = await getAfterDarkEligibility(supabase, viewerId);

    return NextResponse.json({
      eligible: eligibility.eligible,
      ageVerified: eligibility.ageVerified,
      assuranceApproved: eligibility.assuranceApproved,
      reason: eligibility.reason,
    }, { status: eligibility.reason === "not_authenticated" ? 401 : 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ eligible: false, ageVerified: false, assuranceApproved: false, reason: "db_error" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
