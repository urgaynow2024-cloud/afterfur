import { describe, expect, it, vi } from "vitest";
import { getFeedPostsForViewer } from "@/lib/posts.server";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: (table: string) => {
      if (table === "posts") {
        const result = { data: [{ id: "p1", author_id: "a1", created_at: new Date().toISOString(), moderation_status: "visible" }], error: null };
        const q: any = {};
        q.select = () => q; q.order = () => q; q.limit = () => q; q.or = () => q; q.eq = () => q; q.range = () => q;
        q.then = (res: any, rej: any) => Promise.resolve(result).then(res, rej);
        return q;
      }
      if (table === "profiles") return { select: () => ({ in: () => Promise.resolve({ data: [{ id: "a1", is_private: true, username: "a", display_name: "a", avatar_url: null }], error: null }) }) };
      if (table === "follows") return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      if (table === "blocks") return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      if (table === "moderator_roles") return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
      return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
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
