import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type AfterDarkEligibility = {
  eligible: boolean;
  ageVerified: boolean;
  assuranceApproved: boolean;
  reason: "not_authenticated" | "age_not_verified" | "assurance_not_approved" | "eligible" | "db_error";
};

/**
 * Server-side After Dark access eligibility check.
 *
 * After Dark requires TWO separate, independently enforced controls:
 *   1. age_verified        - the account's age has been verified
 *   2. age_assurance_approved - the account's age-assurance controls are approved
 *
 * Both must be true. This is the single source of truth for After Dark access
 * and is enforced here (server-side) and in /api/after-dark/eligibility. The
 * client can neither set these columns nor forge this result.
 */
export async function getAfterDarkEligibility(
  supabase: SupabaseClient<Database> | null,
  userId: string | null,
): Promise<AfterDarkEligibility> {
  if (!userId) {
    return { eligible: false, ageVerified: false, assuranceApproved: false, reason: "not_authenticated" };
  }
  if (!supabase) {
    return { eligible: false, ageVerified: false, assuranceApproved: false, reason: "db_error" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("age_verified, age_assurance_approved")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    return { eligible: false, ageVerified: false, assuranceApproved: false, reason: "db_error" };
  }

  const ageVerified = Boolean(data.age_verified);
  const assuranceApproved = Boolean(data.age_assurance_approved);
  const eligible = ageVerified && assuranceApproved;

  return {
    eligible,
    ageVerified,
    assuranceApproved,
    reason: eligible
      ? "eligible"
      : !ageVerified
        ? "age_not_verified"
        : !assuranceApproved
          ? "assurance_not_approved"
          : "db_error",
  };
}
