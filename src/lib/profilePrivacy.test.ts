import { describe, expect, it } from "vitest";
import { canViewProfile } from "@/lib/profilePrivacy";

describe("profilePrivacy", () => {
  it("owner can view", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "a", followStatus: null, blocked: false })).toBe(true));
  it("public accessible", () => expect(canViewProfile({ isPrivate: false, ownerId: "a", viewerId: "b", followStatus: "none", blocked: false })).toBe(true));
  it("public accessible to anonymous", () => expect(canViewProfile({ isPrivate: false, ownerId: "a", viewerId: null, followStatus: "none", blocked: false })).toBe(true));
  it("accepted follower", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "b", followStatus: "accepted", blocked: false })).toBe(true));
  it("pending denied", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "b", followStatus: "pending", blocked: false })).toBe(false));
  it("rejected denied", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "b", followStatus: "rejected", blocked: false })).toBe(false));
  it("non-follower denied", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "b", followStatus: "none", blocked: false })).toBe(false));
  it("blocked denied", () => expect(canViewProfile({ isPrivate: false, ownerId: "a", viewerId: "b", followStatus: "none", blocked: true })).toBe(false));
  it("blocked owner-context still denied by block flag", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: "b", followStatus: "accepted", blocked: true })).toBe(false));
  it("unauthenticated denied private", () => expect(canViewProfile({ isPrivate: true, ownerId: "a", viewerId: null, followStatus: null, blocked: false })).toBe(false));
});
