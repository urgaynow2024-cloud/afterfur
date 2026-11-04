import { describe, expect, it, vi, beforeEach } from "vitest";

const canViewPostMock = vi.fn();

vi.mock("@/lib/postPrivacy", () => ({
  canViewPost: (...args: any[]) => canViewPostMock(...args),
}));

const postMaybeSingle = vi.fn();
const profileMaybeSingle = vi.fn();
const blocksMaybeSingle = vi.fn();
const followsMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    from: (table: string) => {
      if (table === "posts") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: postMaybeSingle,
            }),
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: profileMaybeSingle,
            }),
          }),
        };
      }
      if (table === "blocks") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: blocksMaybeSingle,
              }),
            }),
          }),
        };
      }
      if (table === "follows") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: followsMaybeSingle,
              }),
            }),
          }),
        };
      }
      return { select: vi.fn() };
    },
  }),
}));

describe("getPostForViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postMaybeSingle.mockReset();
    profileMaybeSingle.mockReset();
    blocksMaybeSingle.mockReset();
    followsMaybeSingle.mockReset();
  });

  it("allows public post access", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: false }, error: null });
    canViewPostMock.mockReturnValueOnce(true);

    const result = await getPostForViewer({ postId: "p1", viewerId: null });
    expect(result.post?.id).toBe("p1");
    expect(result.error).toBeNull();
  });

  it("denies unauthorized access to private account post", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: true }, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewPostMock.mockReturnValueOnce(false);

    const result = await getPostForViewer({ postId: "p1", viewerId: "v1" });
    expect(result.post).toBeNull();
    expect(result.error).toBe("forbidden");
  });

  it("allows owner access", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: true }, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewPostMock.mockReturnValueOnce(true);

    const result = await getPostForViewer({ postId: "p1", viewerId: "a1" });
    expect(result.post?.id).toBe("p1");
    expect(result.error).toBeNull();
  });

  it("allows approved follower access", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: true }, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "accepted" }, error: null });
    canViewPostMock.mockReturnValueOnce(true);

    const result = await getPostForViewer({ postId: "p1", viewerId: "v1" });
    expect(result.post?.id).toBe("p1");
    expect(result.error).toBeNull();
  });

  it("denies pending follower", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: true }, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: { status: "pending" }, error: null });
    canViewPostMock.mockReturnValueOnce(false);

    const result = await getPostForViewer({ postId: "p1", viewerId: "v1" });
    expect(result.post).toBeNull();
    expect(result.error).toBe("forbidden");
  });

  it("denies blocked user", async () => {
    const { getPostForViewer } = await import("@/lib/posts.server");
    const post = { id: "p1", author_id: "a1", content: "hi" };
    postMaybeSingle.mockResolvedValueOnce({ data: post, error: null });
    profileMaybeSingle.mockResolvedValueOnce({ data: { id: "a1", is_private: true }, error: null });
    blocksMaybeSingle.mockResolvedValueOnce({ data: { blocker_id: "v1" }, error: null });
    followsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    canViewPostMock.mockReturnValueOnce(false);

    const result = await getPostForViewer({ postId: "p1", viewerId: "v1" });
    expect(result.post).toBeNull();
    expect(result.error).toBe("forbidden");
  });
});
