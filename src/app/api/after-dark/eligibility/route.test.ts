import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetVerifiedUser = vi.fn();
const mockGetAfterDarkEligibility = vi.fn();
const mockRateLimit = vi.fn(async () => ({ allowed: true }));
let mockClient: any = null;

vi.mock("@/lib/serverAuth", () => ({ getVerifiedUser: mockGetVerifiedUser }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: () => mockClient }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mockRateLimit,
  getClientIp: () => "127.0.0.1",
  getRateLimitKey: ({ userId, ip }: any) => (userId ? `user:${userId}` : `ip:${ip}`),
}));
vi.mock("@/lib/afterDark", () => ({ getAfterDarkEligibility: mockGetAfterDarkEligibility }));

function authHeader(userId: string | null) {
  return userId ? { authorization: `Bearer token-${userId}` } : {};
}

async function runRoute(user: { id: string } | null, eligibility: { eligible: boolean; ageVerified: boolean; assuranceApproved: boolean; reason: string } | null = null) {
  mockGetVerifiedUser.mockResolvedValue(user);
  mockGetAfterDarkEligibility.mockResolvedValue(eligibility ?? { eligible: false, ageVerified: false, assuranceApproved: false, reason: "db_error" });
  mockClient = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
  const { GET } = await import("@/app/api/after-dark/eligibility/route");
  return GET(new NextRequest("http://localhost/api/after-dark/eligibility", { headers: authHeader(user?.id ?? null) } as any));
}

describe("/api/after-dark/eligibility", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("returns 401 for an unauthenticated request", async () => {
    const res = await runRoute(null, { eligible: false, ageVerified: false, assuranceApproved: false, reason: "not_authenticated" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(mockGetVerifiedUser).toHaveBeenCalled();
    expect(mockGetAfterDarkEligibility).toHaveBeenCalledWith(mockClient, null);
  });

  it("returns eligible for a verified user with approved controls", async () => {
    const res = await runRoute({ id: "u-verified" }, { eligible: true, ageVerified: true, assuranceApproved: true, reason: "eligible" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(true);
    expect(body.ageVerified).toBe(true);
    expect(body.assuranceApproved).toBe(true);
    expect(body.reason).toBe("eligible");
    expect(mockGetAfterDarkEligibility).toHaveBeenCalledWith(mockClient, "u-verified");
  });

  it("returns not eligible with age_not_verified for an unverified user", async () => {
    const res = await runRoute({ id: "u-unverified" }, { eligible: false, ageVerified: false, assuranceApproved: true, reason: "age_not_verified" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.reason).toBe("age_not_verified");
  });

  it("returns not eligible with assurance_not_approved when controls are not approved", async () => {
    const res = await runRoute({ id: "u-not-approved" }, { eligible: false, ageVerified: true, assuranceApproved: false, reason: "assurance_not_approved" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.eligible).toBe(false);
    expect(body.reason).toBe("assurance_not_approved");
  });

  it("applies rate limit keyed by user id", async () => {
    await runRoute({ id: "u-verified" }, { eligible: true, ageVerified: true, assuranceApproved: true, reason: "eligible" });
    expect(mockRateLimit).toHaveBeenCalled();
    const calls = (mockRateLimit as any).mock.calls;
    expect(calls[0][0]).toBe("user:u-verified");
  });
});
