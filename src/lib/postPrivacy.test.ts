import { describe, expect, it } from "vitest";
import { canViewPost } from "@/lib/postPrivacy";

describe("postPrivacy", () => {
  const base = { authorId: "a", viewerId: "b", profileIsPrivate: true, followStatus: "none" as const, blocked: false };
  it("public post", () => expect(canViewPost({ ...base, profileIsPrivate: false })).toBe(true));
  it("owner", () => expect(canViewPost({ ...base, viewerId: "a", followStatus: null })).toBe(true));
  it("accepted", () => expect(canViewPost({ ...base, followStatus: "accepted" })).toBe(true));
  it("pending", () => expect(canViewPost({ ...base, followStatus: "pending" })).toBe(false));
  it("rejected", () => expect(canViewPost({ ...base, followStatus: "rejected" })).toBe(false));
  it("non-follower", () => expect(canViewPost(base)).toBe(false));
  it("blocked", () => expect(canViewPost({ ...base, blocked: true, profileIsPrivate: false })).toBe(false));
  it("unauth", () => expect(canViewPost({ ...base, viewerId: null })).toBe(false));
  it("reply to private denied", () => expect(canViewPost({ ...base, followStatus: "accepted", isReplyToPrivate: true })).toBe(true));
  it("repost of private denied for non-follower", () => expect(canViewPost({ ...base, isRepostOfPrivate: true })).toBe(false));
});
