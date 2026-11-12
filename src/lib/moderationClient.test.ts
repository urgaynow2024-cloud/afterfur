import { describe, expect, it } from "vitest";
import { hasModerationNavAccess } from "@/lib/moderationClient";

describe("moderation client nav access", () => {
  it("grants access for moderator payloads", () => {
    expect(hasModerationNavAccess({ ok: true, canModerate: true })).toBe(true);
    expect(hasModerationNavAccess({ ok: true, role: "administrator" })).toBe(true);
  });
  it("denies non-moderator/invalid payloads", () => {
    expect(hasModerationNavAccess(null)).toBe(false);
    expect(hasModerationNavAccess({ ok: false, canModerate: true })).toBe(false);
    expect(hasModerationNavAccess({ ok: true, role: null, canModerate: false })).toBe(false);
  });
});
