import { describe, expect, it, vi } from "vitest";
import { getFeedPostsForViewer } from "@/lib/posts.server";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "posts") {
        return {
          select: () => ({
            order: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [{ id: "p1", author_id: "a1", created_at: new Date().toISOString() }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [{ id: "a1", is_private: true, username: "a", display_name: "a", avatar_url: null }], error: null }),
          }),
        };
      }
      if (table === "follows") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === "blocks") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      return { select: vi.fn() };
    },
  }),
}));

vi.mock("@/lib/feedPrivacy", () => ({
  canShowPostInFeed: () => false,
}));

describe("feed server privacy", () => {
  it("unauthorized private posts never appear in feed results", async () => {
    const result = await getFeedPostsForViewer({ viewerId: "v1", limit: 10 });
    expect(result.posts).toEqual([]);
  });
});
