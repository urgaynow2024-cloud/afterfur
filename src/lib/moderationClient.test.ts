import { describe, expect, it } from "vitest";
import { hasModerationNavAccess } from "@/lib/moderationClient";

describe("hasModerationNavAccess (permission-aware More menu)", () => {
  it("hides for regular users / unauthorized responses", () => {
    expect(hasModerationNavAccess(null)).toBe(false);
    expect(hasModerationNavAccess({ ok: false, role: null })).toBe(false);
    expect(hasModerationNavAccess({ ok: true, role: null, canModerate: false })).toBe(false);
  });

  it("shows for moderators", () => {
    expect(hasModerationNavAccess({ ok: true, role: "moderator", canModerate: true })).toBe(true);
  });

  it("shows for senior moderators", () => {
    expect(hasModerationNavAccess({ ok: true, role: "senior_moderator", canModerate: true })).toBe(true);
  });

  it("shows for administrators", () => {
    expect(hasModerationNavAccess({ ok: true, role: "administrator", canModerate: true, })).toBe(true);
  });

  it("shows for owner/admin via canModerate or administrator role from verified endpoint", () => {
    // /api/moderation/me resolves trusted afterfur_staff_admin owner as administrator
    expect(hasModerationNavAccess({ ok: true, role: "administrator", canModerate: true })).toBe(true);
  });

  it("does not grant access from untrusted/missing ok flag", () => {
    expect(hasModerationNavAccess({ role: "administrator", canModerate: true } as any)).toBe(false);
  });
});
