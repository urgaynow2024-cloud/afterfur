import { describe, expect, it, vi, beforeEach } from "vitest";
import { getAfterDarkEligibility } from "@/lib/afterDark";

type Profile = { age_verified: boolean | null; age_assurance_approved: boolean | null } | null;

function makeSupabase(profile: Profile, error: any = null): any {
  const maybeSingle = vi.fn(async () => ({ data: profile, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from, select, eq, maybeSingle };
}

describe("getAfterDarkEligibility", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns eligible when both age verification and assurance controls are approved", async () => {
    const supabase = makeSupabase({ age_verified: true, age_assurance_approved: true });
    const result = await getAfterDarkEligibility(supabase, "u-verified");
    expect(result.eligible).toBe(true);
    expect(result.ageVerified).toBe(true);
    expect(result.assuranceApproved).toBe(true);
    expect(result.reason).toBe("eligible");
    expect(supabase.from).toHaveBeenCalledWith("profiles");
    expect(supabase.select).toHaveBeenCalledWith("age_verified, age_assurance_approved");
    expect(supabase.eq).toHaveBeenCalledWith("id", "u-verified");
  });

  it("returns age_not_verified when age is not verified", async () => {
    const supabase = makeSupabase({ age_verified: false, age_assurance_approved: true });
    const result = await getAfterDarkEligibility(supabase, "u-unverified");
    expect(result.eligible).toBe(false);
    expect(result.ageVerified).toBe(false);
    expect(result.assuranceApproved).toBe(true);
    expect(result.reason).toBe("age_not_verified");
  });

  it("returns assurance_not_approved when age is verified but controls are not approved", async () => {
    const supabase = makeSupabase({ age_verified: true, age_assurance_approved: false });
    const result = await getAfterDarkEligibility(supabase, "u-not-approved");
    expect(result.eligible).toBe(false);
    expect(result.ageVerified).toBe(true);
    expect(result.assuranceApproved).toBe(false);
    expect(result.reason).toBe("assurance_not_approved");
  });

  it("prioritises age_not_verified when neither requirement is satisfied", async () => {
    const supabase = makeSupabase({ age_verified: false, age_assurance_approved: false });
    const result = await getAfterDarkEligibility(supabase, "u-neither");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("age_not_verified");
  });

  it("treats null database columns as not satisfied", async () => {
    const supabase = makeSupabase({ age_verified: null, age_assurance_approved: null });
    const result = await getAfterDarkEligibility(supabase, "u-null");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("age_not_verified");
  });

  it("returns not_authenticated when there is no authenticated user", async () => {
    const result = await getAfterDarkEligibility(makeSupabase({ age_verified: true, age_assurance_approved: true }), null);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("not_authenticated");
  });

  it("returns db_error when the supabase client is unavailable", async () => {
    const result = await getAfterDarkEligibility(null, "u-verified");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("db_error");
  });

  it("returns db_error when the profile query errors", async () => {
    const supabase = makeSupabase(null, { message: "connection failed", code: "PGRST116" });
    const result = await getAfterDarkEligibility(supabase, "u-verified");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("db_error");
  });

  it("returns db_error when no profile row exists for the user", async () => {
    const supabase = makeSupabase(null, null);
    const result = await getAfterDarkEligibility(supabase, "u-missing");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("db_error");
  });
});
