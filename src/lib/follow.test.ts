import { describe, it, expect } from "vitest";
import { canFollow, publicProfileUrl, publicPostUrl, insertAtCursor, followActionFor } from "@/lib/follow";

describe("follow helpers", () => {
  it("prevents self-follow", () => {
    expect(canFollow("user-1", "user-1")).toBe(false);
  });

  it("allows following a different user", () => {
    expect(canFollow("user-1", "user-2")).toBe(true);
  });

  it("rejects missing IDs", () => {
    expect(canFollow(null, "user-2")).toBe(false);
    expect(canFollow("user-1", null)).toBe(false);
    expect(canFollow(undefined, undefined)).toBe(false);
  });

  it("returns follow for public profile when none", () => {
    expect(followActionFor(false, "none")).toBe("follow");
  });

  it("returns request for private profile when none", () => {
    expect(followActionFor(true, "none")).toBe("request");
  });

  it("returns unfollow when accepted", () => {
    expect(followActionFor(false, "accepted")).toBe("unfollow");
    expect(followActionFor(true, "accepted")).toBe("unfollow");
  });

  it("returns cancel when pending", () => {
    expect(followActionFor(false, "pending")).toBe("cancel");
    expect(followActionFor(true, "pending")).toBe("cancel");
  });

  it("allows requesting again after rejection", () => {
    expect(followActionFor(false, "rejected")).toBe("request");
    expect(followActionFor(true, "rejected")).toBe("request");
  });
});

describe("URL helpers", () => {
  it("builds canonical profile URLs", () => {
    expect(publicProfileUrl("alice")).toBe("/alice");
  });

  it("encodes profile usernames", () => {
    expect(publicProfileUrl("a b")).toBe("/a%20b");
  });

  it("rejects invalid profile usernames", () => {
    expect(() => publicProfileUrl("")).toThrow("Username is required");
    expect(() => publicProfileUrl("   ")).toThrow("Username is required");
  });

  it("builds canonical post URLs", () => {
    expect(publicPostUrl("alice", "post-1")).toBe("/alice/status/post-1");
  });

  it("encodes post IDs", () => {
    expect(publicPostUrl("a b", "post 1")).toBe("/a%20b/status/post%201");
  });

  it("rejects invalid post inputs", () => {
    expect(() => publicPostUrl("", "post-1")).toThrow("Username is required");
    expect(() => publicPostUrl("alice", "")).toThrow("Post ID is required");
  });
});

describe("cursor insertion", () => {
  it("inserts at the start", () => {
    expect(insertAtCursor("world", 0, 0, "hello ")).toBe("hello world");
  });

  it("inserts in the middle", () => {
    expect(insertAtCursor("hllo", 1, 1, "e")).toBe("hello");
  });

  it("replaces a selection", () => {
    expect(insertAtCursor("hello world", 6, 11, "AfterFur")).toBe("hello AfterFur");
  });

  it("clamps invalid cursor positions", () => {
    expect(insertAtCursor("abc", 10, 20, "!")).toBe("abc!");
  });
});

