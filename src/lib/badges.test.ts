import { describe, expect, it } from "vitest";
import { BADGE_REGISTRY, canManageStaffBadge, changeStaffBadge, eligibleAccountAnniversaryBadges, eligiblePawPassBadgeIds, knownBadges, MANAGEABLE_BADGES, mergeBadgeAwards, PAWPASS_BADGES, STAFF_BADGE_IDS, TRUST_BADGES } from "@/lib/badges";

describe("staff badge authorization rules", () => {
  const admin = { afterfur_staff_admin: true };
  it("grants and revokes independently, while moderator is not an administrator", () => {
    expect(changeStaffBadge([], "admin", "member", "staff_moderator", "grant", admin)).toEqual({ assignments: ["staff_moderator"], error: null });
    expect(changeStaffBadge(["staff_moderator", "staff_tester"], "admin", "member", "staff_moderator", "revoke", admin).assignments).toEqual(["staff_tester"]);
    expect(canManageStaffBadge("moderator-user", "member", { badge: "staff_moderator" })).toBe(false);
    expect(STAFF_BADGE_IDS).toEqual(["staff_founder", "staff_moderator", "staff_developer", "staff_tester"]);
  });
  it("rejects missing administrator claims and unknown roles, but allows verified owners to self-assign", () => {
    expect(changeStaffBadge([], "member", "member", "staff_founder", "grant", {}).error).toBe("forbidden");
    expect(changeStaffBadge([], "member", "other", "staff_founder", "grant", {}).error).toBe("forbidden");
    expect(changeStaffBadge([], "admin", "member", "owner", "grant", admin).error).toBe("invalid_badge");
    // Verified owners (admin claim) may self-assign.
    expect(changeStaffBadge([], "owner", "owner", "staff_founder", "grant", admin)).toEqual({ assignments: ["staff_founder"], error: null });
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


describe('badge catalogue', () => {
  it('registers the expanded catalogue and manual badge set', () => {
    const ids = MANAGEABLE_BADGES.map((b) => b.id);
    expect(ids).toContain('access_age_verified');
    expect(ids).toContain('access_approved');
    expect(ids).toContain('creator_featured');
    expect(ids).toContain('achievement_event_winner');
    expect(ids).toContain('community_helper');
    expect(MANAGEABLE_BADGES.length).toBe(11);
  });
});


describe('ad creator badge', () => {
  it('registers ad_creator with the correct label and icon', () => {
    const badge = BADGE_REGISTRY.find((b) => b.id === 'ad_creator');
    expect(badge).toBeDefined();
    expect(badge?.label).toBe('AD Creator');
    expect(badge?.mark).toBe('🌙');
  });
});

describe("manual badge re-award lifecycle (regression)", () => {
  const admin = { afterfur_staff_admin: true };

  it("awards a badge successfully", () => {
    expect(changeStaffBadge([], "admin", "member", "creator_featured", "grant", admin)).toEqual({ assignments: ["creator_featured"], error: null });
  });

  it("removes a badge successfully without affecting other badges", () => {
    const removed = changeStaffBadge(["creator_featured", "access_age_verified"], "admin", "member", "creator_featured", "revoke", admin);
    expect(removed.error).toBeNull();
    expect(removed.assignments).toEqual(["access_age_verified"]);
  });

  it("re-awards the same badge successfully after removal", () => {
    const granted = changeStaffBadge([], "admin", "member", "creator_featured", "grant", admin);
    const revoked = changeStaffBadge(granted.assignments, "admin", "member", "creator_featured", "revoke", admin);
    expect(revoked.assignments).not.toContain("creator_featured");
    const reAwarded = changeStaffBadge(revoked.assignments, "admin", "member", "creator_featured", "revoke", admin);
    // revoking a non-active badge is a no-op guard in client helper
    expect(reAwarded.error).toBe("not_active");
    const reGranted = changeStaffBadge(revoked.assignments, "admin", "member", "creator_featured", "grant", admin);
    expect(reGranted).toEqual({ assignments: ["creator_featured"], error: null });
  });

  it("prevents duplicate active assignments", () => {
    const once = changeStaffBadge([], "admin", "member", "creator_featured", "grant", admin);
    const twice = changeStaffBadge(once.assignments, "admin", "member", "creator_featured", "grant", admin);
    expect(twice.error).toBe("duplicate_active");
    expect(twice.assignments).toEqual(["creator_featured"]);
  });

  it("preserves correct badge display after re-awarding (no duplicates, stable knownBadges)", () => {
    const awarded = changeStaffBadge([], "admin", "member", "ad_creator", "grant", admin);
    const revoked = changeStaffBadge(awarded.assignments, "admin", "member", "ad_creator", "revoke", admin);
    const reAwarded = changeStaffBadge(revoked.assignments, "admin", "member", "ad_creator", "grant", admin);
    expect(reAwarded.assignments.filter((id) => id === "ad_creator")).toHaveLength(1);
    expect(knownBadges(reAwarded.assignments).map((b) => b.id)).toContain("ad_creator");
  });

  it("supports expanded manual badges (not only legacy staff role IDs)", () => {
    expect(changeStaffBadge([], "admin", "member", "community_helper", "grant", admin).error).toBeNull();
    expect(changeStaffBadge([], "admin", "member", "web_designer", "grant", admin).error).toBeNull();
  });
});
