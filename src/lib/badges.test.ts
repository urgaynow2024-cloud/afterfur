import { describe, expect, it } from "vitest";
import { canManageStaffBadge, changeStaffBadge, eligibleAccountAnniversaryBadges, eligiblePawPassBadgeIds, knownBadges, mergeBadgeAwards, PAWPASS_BADGES, STAFF_BADGE_IDS, TRUST_BADGES } from "@/lib/badges";

describe("staff badge authorization rules", () => {
  const admin = { afterfur_staff_admin: true };
  it("grants and revokes independently, while moderator is not an administrator", () => {
    expect(changeStaffBadge([], "admin", "member", "staff_moderator", "grant", admin)).toEqual({ assignments: ["staff_moderator"], error: null });
    expect(changeStaffBadge(["staff_moderator", "staff_tester"], "admin", "member", "staff_moderator", "revoke", admin).assignments).toEqual(["staff_tester"]);
    expect(canManageStaffBadge("moderator-user", "member", { badge: "staff_moderator" })).toBe(false);
    expect(STAFF_BADGE_IDS).toEqual(["staff_founder", "staff_moderator", "staff_developer", "staff_tester"]);
  });
  it("rejects missing administrator claims, self-assignment, and unknown roles", () => {
    expect(changeStaffBadge([], "member", "member", "staff_founder", "grant", admin).error).toBe("forbidden");
    expect(changeStaffBadge([], "member", "other", "staff_founder", "grant", {}).error).toBe("forbidden");
    expect(changeStaffBadge([], "admin", "member", "owner", "grant", admin).error).toBe("invalid_badge");
  });
});

describe("PawPass anniversary awards", () => {
  const start = "2025-01-15T00:00:00.000Z";
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))("awards month %i only once the verified anniversary is reached", (month) => {
    const anniversary = new Date(start);
    anniversary.setUTCMonth(anniversary.getUTCMonth() + month);
    const before = new Date(anniversary.getTime() - 1).toISOString();
    const after = new Date(anniversary.getTime() + 1).toISOString();
    const got = eligiblePawPassBadgeIds(start, "active", after, after);
    expect(got).toContain(`pawpass_month_${month}`);
    expect(eligiblePawPassBadgeIds(start, "active", before, before)).not.toContain(`pawpass_month_${month}`);
  });
  it("stops new awards at expiry and retains earned history across retries", () => {
    const earned = mergeBadgeAwards(["pawpass_month_1"], eligiblePawPassBadgeIds(start, "expired", "2025-06-15T00:00:00Z", "2025-08-15T00:00:00Z"));
    expect(earned).toEqual(["pawpass_month_1"]);
    expect(mergeBadgeAwards(earned, ["pawpass_month_1"])).toEqual(earned);
    expect(eligiblePawPassBadgeIds(start, "past_due", null, "2026-01-01T00:00:00Z")).toEqual([]);
  });
  it("has twelve distinct registered membership badges", () => {
    expect(PAWPASS_BADGES).toHaveLength(12);
    expect(new Set(PAWPASS_BADGES.map((badge) => badge.id)).size).toBe(12);
  });
  it("supports yearly anniversaries after the twelve monthly awards", () => {
    const throughYearTwo = eligiblePawPassBadgeIds(start, "active", "2027-01-15T00:00:00Z", "2027-01-15T00:00:00Z");
    expect(throughYearTwo).toContain("pawpass_month_12");
    expect(throughYearTwo).toContain("pawpass_year_1");
    expect(throughYearTwo).toContain("pawpass_year_2");
    expect(throughYearTwo).not.toContain("pawpass_year_3");
  });
  it("clamps month-end anniversaries consistently for short months", () => {
    expect(eligiblePawPassBadgeIds("2025-01-31T00:00:00Z", "active", "2025-02-28T00:00:00Z", "2025-02-28T00:00:00Z")).toContain("pawpass_month_1");
  });
});

describe("badge display registry", () => {
  it("orders badges, removes duplicates, and safely ignores unknown identifiers", () => {
    expect(knownBadges(["unknown_role", "pawpass_month_1", "staff_tester", "staff_tester"]).map((badge) => badge.id)).toEqual(["staff_tester", "pawpass_month_1"]);
    expect(knownBadges(["unknown_role"])).toEqual([]);
  });
});

describe("account anniversary milestone eligibility", () => {
  it("uses completed account anniversaries and caps at the registered range", () => {
    expect(eligibleAccountAnniversaryBadges("2020-06-15T12:00:00Z", "2021-06-15T11:59:59Z")).toEqual([]);
    expect(eligibleAccountAnniversaryBadges("2020-06-15T12:00:00Z", "2021-06-15T12:00:00Z")).toEqual(["milestone_account_year_1"]);
    expect(eligibleAccountAnniversaryBadges("2000-01-01T00:00:00Z", "2026-10-29T00:00:00Z")).toHaveLength(26);
    expect(eligibleAccountAnniversaryBadges("not-a-date", "2026-01-01T00:00:00Z")).toEqual([]);
  });
});

describe("trust badge registration", () => {
  it("registers After Dark, Age Verified and Approved without auto-award logic", () => {
    expect(TRUST_BADGES.map((b) => b.id)).toEqual(["access_after_dark", "access_age_verified", "access_approved"]);
    expect(TRUST_BADGES.every((b) => b.category === "trust")).toBe(true);
    expect(knownBadges(["access_after_dark"]).map((b) => b.id)).toEqual(["access_after_dark"]);
    expect(knownBadges(["access_age_verified", "unknown_access"]).map((b) => b.id)).toEqual(["access_age_verified"]);
  });
});
