import { describe, expect, it, vi } from "vitest";
import { addPostToFeed, mergeFeedPosts, submitAndPublishPost } from "@/lib/feed";
import { acquireInteractionLock, nextLikeState, optimisticLikeCount, parseLikeCountRows, reconcileLikeCount, reconcileLikeCountRows, releaseInteractionLock, resolveLikeToggle } from "@/lib/likes";

type TestPost = { id: string; created_at: string; content: string };

describe("feed post submission", () => {
  it("shows a successful post immediately without a feed refetch", async () => {
    const inserted: TestPost = { id: "new", created_at: "2026-10-28T12:00:00Z", content: "hello" };
    const older: TestPost = { id: "old", created_at: "2026-10-28T11:00:00Z", content: "older" };
    let visiblePosts = [older];
    const reloadFeed = vi.fn();

    const result = await submitAndPublishPost(
      async () => ({ data: inserted, error: null }),
      (post) => { visiblePosts = addPostToFeed(visiblePosts, post); },
    );

    expect(result.error).toBeNull();
    expect(visiblePosts).toEqual([inserted, older]);
    expect(reloadFeed).not.toHaveBeenCalled();
  });

  it("does not add a phantom post when insertion fails", async () => {
    const older: TestPost = { id: "old", created_at: "2026-10-28T11:00:00Z", content: "older" };
    let visiblePosts = [older];
    const publish = vi.fn((post: TestPost) => { visiblePosts = addPostToFeed(visiblePosts, post); });

    const result = await submitAndPublishPost<TestPost>(
      async () => ({ data: null, error: { message: "insert failed" } }),
      publish,
    );

    expect(result.error).toBe("insert failed");
    expect(publish).not.toHaveBeenCalled();
    expect(visiblePosts).toEqual([older]);
  });

  it("keeps a post only once and in timestamp order", () => {
    const post: TestPost = { id: "new", created_at: "2026-10-28T12:00:00Z", content: "hello" };
    const older: TestPost = { id: "old", created_at: "2026-10-28T11:00:00Z", content: "older" };
    expect(addPostToFeed([older, post], post)).toEqual([post, older]);
  });

  it("uses descending IDs as a stable tie-breaker for cursor pagination", () => {
    const sameTime = "2026-10-28T12:00:00Z";
    const first = { id: "00000000-0000-0000-0000-000000000001", created_at: sameTime, content: "first" };
    const second = { id: "00000000-0000-0000-0000-000000000002", created_at: sameTime, content: "second" };
    expect(mergeFeedPosts([], [first, second])).toEqual([second, first]);
    expect(addPostToFeed([first], second)).toEqual([second, first]);
  });

  it("keeps a local insert when the initial fetch finishes afterward", () => {
    const inserted: TestPost = { id: "new", created_at: "2026-10-28T12:00:00Z", content: "hello" };
    const older: TestPost = { id: "old", created_at: "2026-10-28T11:00:00Z", content: "older" };
    expect(mergeFeedPosts([inserted], [older])).toEqual([inserted, older]);
  });
});

describe("post like state reconciliation", () => {
  it("flips the visible state optimistically", () => {
    expect(nextLikeState(false)).toBe(true);
    expect(nextLikeState(true)).toBe(false);
  });

  it("supports bookmark and repost activation and undo through the same transition", () => {
    for (const interaction of ["bookmark", "repost"]) {
      expect({ interaction, active: nextLikeState(false) }).toEqual({ interaction, active: true });
      expect({ interaction, active: nextLikeState(true) }).toEqual({ interaction, active: false });
    }
  });

  it("restores the previous state when a failed mutation is confirmed absent", () => {
    expect(resolveLikeToggle(false, true, false, "insert denied", null)).toEqual({ liked: false, error: "insert denied" });
  });

  it("rolls back failed like, bookmark, and repost mutations", () => {
    for (const interaction of ["like", "bookmark", "repost"]) {
      const result = resolveLikeToggle(false, true, false, `${interaction} denied`, null);
      expect(result).toEqual({ liked: false, error: `${interaction} denied` });
    }
  });

  it("uses the confirmed row state to reconcile a successful toggle", () => {
    expect(resolveLikeToggle(true, false, false, null, null)).toEqual({ liked: false, error: null });
    expect(resolveLikeToggle(false, true, true, null, null)).toEqual({ liked: true, error: null });
    expect(resolveLikeToggle(false, true, true, "response interrupted", null)).toEqual({ liked: true, error: null });
  });

  it("increments a known count optimistically and restores it when the request fails", () => {
    const originalCount = 8;
    const optimisticCount = optimisticLikeCount(originalCount, false);
    expect(optimisticCount).toBe(9);
    expect(reconcileLikeCount(originalCount, false, false)).toBe(8);
  });

  it("reconciles both like and unlike counts against persisted state", () => {
    expect(reconcileLikeCount(8, false, true)).toBe(9);
    expect(reconcileLikeCount(8, true, false)).toBe(7);
    expect(reconcileLikeCount(8, false, false)).toBe(8);
  });

  it("keeps the like count unavailable when no authorized total was loaded", () => {
    expect(optimisticLikeCount(null, false)).toBeNull();
  });

  it("does not show missing, negative, malformed, or unsafe count results", () => {
    expect(parseLikeCountRows(null)).toEqual({});
    expect(parseLikeCountRows([{ post_id: "post-a" }, { post_id: "post-b", like_count: -1 }, { post_id: "post-c", like_count: "many" }, { post_id: "post-d", like_count: Number.MAX_SAFE_INTEGER + 1 }])).toEqual({});
  });

  it("accepts zero and integer-like RPC count results", () => {
    expect(parseLikeCountRows([{ post_id: "post-a", like_count: 0 }, { post_id: "post-b", like_count: "12" }])).toEqual({ "post-a": 0, "post-b": 12 });
    expect(parseLikeCountRows([{ post_id: "post-zero", repost_count: 0 }, { post_id: "post-many", repost_count: "7" }], "repost_count")).toEqual({ "post-zero": 0, "post-many": 7 });
  });

  it("keeps refreshed per-post totals scoped so merged feed cards stay consistent", () => {
    const fromHome = reconcileLikeCountRows({}, ["post-a", "post-b"], [{ post_id: "post-a", repost_count: 8 }, { post_id: "post-b", repost_count: 3 }], "repost_count");
    const afterNavigation = reconcileLikeCountRows(fromHome, ["post-a"], [{ post_id: "post-a", repost_count: 9 }], "repost_count");
    expect(afterNavigation).toEqual({ "post-a": 9, "post-b": 3 });
    expect(reconcileLikeCountRows({ "post-a": 8, "post-b": 3 }, ["post-a", "post-b"], [{ post_id: "post-a", repost_count: -1 }], "repost_count")).toEqual({});
  });

  it("blocks duplicate interaction requests until the first request releases its lock", () => {
    const pending = new Set<string>();
    expect(acquireInteractionLock(pending, "reposts:post-a")).toBe(true);
    expect(acquireInteractionLock(pending, "reposts:post-a")).toBe(false);
    releaseInteractionLock(pending, "reposts:post-a");
    expect(acquireInteractionLock(pending, "reposts:post-a")).toBe(true);
  });

  it("optimistically increments and decrements repost counts, then rolls back on failure", () => {
    const count = 4;
    expect(optimisticLikeCount(count, false)).toBe(5);
    expect(reconcileLikeCount(count, false, true)).toBe(5);
    expect(optimisticLikeCount(count, true)).toBe(3);
    expect(reconcileLikeCount(count, true, false)).toBe(3);
    expect(resolveLikeToggle(true, false, true, "delete failed", null)).toEqual({ liked: true, error: "delete failed" });
    expect(reconcileLikeCount(count, true, true)).toBe(count);
    expect(resolveLikeToggle(false, true, false, "insert failed", null)).toEqual({ liked: false, error: "insert failed" });
    expect(reconcileLikeCount(count, false, false)).toBe(count);
  });
});
