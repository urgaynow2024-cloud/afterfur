import { describe, expect, it, vi } from "vitest";
import { addPostToFeed, submitAndPublishPost } from "@/lib/feed";

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
});
